/**
 * Kimini Lesson Report Generator - Content Script
 * Extracts lesson information from Kimini / Glats lesson pages and rooms.
 */

(() => {
  // Replace the old listener when the popup reinjects this file into an open tab.
  if (window.__kiminiExtractorMessageHandler) {
    chrome.runtime.onMessage.removeListener(window.__kiminiExtractorMessageHandler);
  }

  // Listen for extraction requests from the popup
  window.__kiminiExtractorMessageHandler = (request, sender, sendResponse) => {
    if (request.action === 'extract_kimini_data') {
      try {
        const data = scrapeKiminiLessonData(request.lessonMatch);
        sendResponse({ success: true, data });
      } catch (err) {
        console.error('[Kimini Extractor Error]:', err);
        sendResponse({ success: false, error: err.message, data: getFallbackData() });
      }
    }
    return true; // Keep message channel open for async response
  };
  chrome.runtime.onMessage.addListener(window.__kiminiExtractorMessageHandler);

  /**
   * Main scraping function with multi-level heuristic strategies
   */
  function scrapeKiminiLessonData(lessonMatch = null) {
    const result = {
      date: '',
      time: '',
      classType: '',
      studentName: '',
      feedbackNickname: '',
      teacherName: '',
      schoolName: '',
      url: window.location.href,
      matched: false,
      matchedDashboardStudent: false
    };

    // Strategy 0: Exact Kimini Portal Elements (.tag.site and Course container)
    extractKiminiPortalSpecifics(result);

    // Strategy 1: Check structured key-value tables and definition lists
    extractFromStructuredTables(result);

    // Strategy 2: Check labeled key-value DOM elements (cards, info badges, header widgets)
    if (!result.studentName || !result.schoolName || !result.date) {
      extractFromLabeledElements(result);
    }

    // Strategy 3: Check classroom-specific header / room title bars
    if (!result.studentName || !result.classType) {
      extractFromClassroomHeader(result);
    }

    // Strategy 4: Fallback Regex matching on innerText
    if (!result.date || !result.time || !result.schoolName || !result.studentName) {
      extractFromPageTextRegex(result);
    }

    if (lessonMatch && isDashboardPage()) {
      const dashboardStudent = findDashboardStudentForLesson(lessonMatch, result.date);
      if (dashboardStudent) {
        result.studentName = dashboardStudent;
        result.matchedDashboardStudent = true;
      }
    }

    const feedbackNickname = document.querySelector(
      '.gvt-slidenavi__student-text[data-id="nickname"]'
    ) || (!isDashboardPage()
      ? document.querySelector('a[href*="/student/"], a[href^="/student/"]')
      : null);
    if (feedbackNickname) {
      result.feedbackNickname = cleanValue(feedbackNickname.textContent);
      if (!result.matchedDashboardStudent) {
        result.studentName = result.feedbackNickname;
      }
    }

    // Strategy 5: Normalize and format dates/times
    normalizeResults(result);

    // If at least one meaningful field was found, mark as matched
    if (result.studentName || result.schoolName || result.classType || result.time) {
      result.matched = true;
    }

    return result;
  }

  function isDashboardPage() {
    const url = window.location.href;
    return /(?:^|\/\/)teacher\.glats\.online\/?(?:[?#]|$)/i.test(url) ||
      /dashboard/i.test(url);
  }

  function findDashboardStudentForLesson(lessonMatch, dashboardDate) {
    const targetTime = getTimeKey(lessonMatch.time || '');
    if (!targetTime) return '';

    const targetDate = getDateKey(lessonMatch.date || '');
    const pageDate = getDateKey(dashboardDate || '');
    const matchingNames = new Set();

    document.querySelectorAll('tr').forEach((row) => {
      const contextText = cleanValue(row.innerText || row.textContent);
      const contextTime = getTimeKey(contextText);
      if (!contextTime || contextTime.start !== targetTime.start) return;
      if (targetTime.end && contextTime.end !== targetTime.end) return;

      const contextDate = getDateKey(contextText);
      const displayedDate = contextDate || pageDate;
      if (targetDate && targetDate !== displayedDate) return;

      const nameElement = row.querySelector(
        '.caption > span.bold.plain, a[href*="/student/"], a[href^="/student/"]'
      );
      const name = nameElement
        ? extractEnglishNameOnly(cleanValue(nameElement.textContent))
        : '';
      if (name) matchingNames.add(name);
    });

    return matchingNames.size === 1 ? matchingNames.values().next().value : '';
  }

  function getTimeKey(text) {
    const match = text.match(/(\d{1,2}):(\d{2})(?:\s*[-~～–]\s*(\d{1,2}):(\d{2}))?/);
    if (!match) return null;
    return {
      start: `${match[1].padStart(2, '0')}:${match[2]}`,
      end: match[3] ? `${match[3].padStart(2, '0')}:${match[4]}` : ''
    };
  }

  function getDateKey(text) {
    const match = text.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
    if (!match) return '';
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  /**
   * Strategy 0: Exact Kimini / Glats Portal elements (.tag.site & course structure)
   * User condition:
   * - If Course begins with school structure (e.g. Kinjo/2026/Jr1 or Tsurugakehi/2026/Hi2/...),
   *   prioritize the school name from the course (Kinjo, Tsurugakehi).
   * - If Course is generic/different (e.g. Eiken Grade 3 ▶ ...), do NOT copy the course name;
   *   extract the school name from .tag.site (e.g. kbghs).
   */
  function extractKiminiPortalSpecifics(result) {
    // 1. Student Name: exact link <a href="/student/..." class="bold plain">...</a>
    const studentLink = document.querySelector('a[href*="/student/"], a[href^="/student/"]');
    if (studentLink) {
      // Use full name on dashboard pages; otherwise extract English‑only name.
      const rawName = cleanValue(studentLink.textContent);
      if (isDashboardPage()) {
        result.studentName = rawName; // keep full name
      } else {
        result.studentName = extractEnglishNameOnly(rawName);
      }
    }

    // 2. Teacher Name: exact link <a href="/teacher/..." class="bold plain">...</a>
    const teacherLink = document.querySelector('a[href*="/teacher/"], a[href^="/teacher/"]');
    if (teacherLink) {
      result.teacherName = cleanValue(teacherLink.textContent);
    }

    // 3. Site Tag (School Name badge) e.g. <div class="tag site top-2px ml2">kbghs</div>
    const tagSite = document.querySelector('.tag.site, .tag.site.top-2px.ml2, div.tag.site');
    const siteTagText = tagSite ? cleanValue(tagSite.textContent) : '';

    // 2. Course Element
    // e.g. <dd><div class="line"><a href="/original_course/Kinjo-2026-Jr1" class="bold plain">Kinjo/2026/Jr1</a></div>...
    let courseText = findMatchingOriginalCourse(siteTagText);

    if (!courseText && siteTagText) {
      courseText = findCoursePathForSchool(siteTagText);
    }

    if (!courseText) {
      // Find dl -> dt with "Course" -> dd
      const allDts = document.querySelectorAll('dt');
      for (const dt of allDts) {
        if (/course|コース/i.test(dt.textContent)) {
          const dd = dt.nextElementSibling;
          if (dd && dd.tagName.toLowerCase() === 'dd') {
            const firstLine = dd.querySelector('.line a, .line');
            courseText = cleanValue(firstLine ? firstLine.textContent : dd.textContent);
            break;
          }
        }
      }
    }

    // 3. Conditional School Resolution:
    // If course begins with the school name (e.g. Tsurugakehi/2026/Hi2/1-1/2nd and tsurugakehi),
    // we put that full course in the school detail!
    // But if course is different (e.g. Eiken Grade 3 and kbghs), we only put the school name!
    if (siteTagText && courseText) {
      const courseFirstPart = courseText.split(/[\/▶>]/)[0].trim();
      const tagLower = normalizeSchoolKey(siteTagText);
      const coursePartLower = normalizeSchoolKey(courseFirstPart);

      const isSame = tagLower === coursePartLower;

      if (isSame) {
        result.schoolName = courseText;
      } else {
        result.schoolName = siteTagText;
      }
    } else if (courseText && /^[A-Za-z0-9_\-]+\/\d{4}\//.test(courseText)) {
      result.schoolName = courseText;
    } else if (siteTagText) {
      result.schoolName = siteTagText;
    }

    // 4. Class detection from course: default is SP, unless explicitly Regular
    if (courseText && /regular|通常|標準/i.test(courseText)) {
      result.classType = 'Regular';
    } else {
      result.classType = 'SP';
    }
  }

  function normalizeSchoolKey(str) {
    return cleanValue(str)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function findMatchingOriginalCourse(siteTagText) {
    const links = Array.from(document.querySelectorAll('a[href*="/original_course/"]'));
    if (links.length === 0) return '';

    const tagKey = normalizeSchoolKey(siteTagText);
    const courseCandidates = links
      .map(link => {
        const textValue = cleanValue(link.textContent);
        const hrefValue = courseTextFromOriginalCourseHref(link);
        return textValue.includes('/') ? textValue : hrefValue || textValue;
      })
      .filter(Boolean);

    if (tagKey) {
      const matchingCourse = courseCandidates.find(course => {
        const courseFirstPart = course.split(/[\/▶>]/)[0].trim();
        return normalizeSchoolKey(courseFirstPart) === tagKey;
      });
      if (matchingCourse) return matchingCourse;
    }

    return courseCandidates[0] || '';
  }

  function findCoursePathForSchool(siteTagText) {
    const fullText = document.body ? document.body.innerText : '';
    if (!fullText) return '';

    const schoolKey = escapeRegExp(siteTagText.trim());
    const coursePattern = new RegExp(`\\b(${schoolKey}\\/\\d{4}\\/[^\\s\\n\\r\\t▶>]+)`, 'i');
    const match = fullText.match(coursePattern);
    return match ? cleanValue(match[1]) : '';
  }

  function courseTextFromOriginalCourseHref(link) {
    const href = link.getAttribute('href') || '';
    const match = href.match(/\/original_course\/([^?#]+)/);
    if (!match) return '';

    const parts = decodeURIComponent(match[1]).split('-');
    if (parts.length < 3 || !/^\d{4}$/.test(parts[1])) return '';

    const school = parts[0];
    const year = parts[1];
    const grade = parts[2];
    const rest = parts.slice(3).join('-');
    return rest ? `${school}/${year}/${grade}/${rest}` : `${school}/${year}/${grade}`;
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Strategy 1: Extract from HTML tables (th/td) and definition lists (dt/dd)
   */
  function extractFromStructuredTables(result) {
    // 1. Table rows
    const rows = document.querySelectorAll('tr');
    rows.forEach(tr => {
      const th = tr.querySelector('th');
      const tds = tr.querySelectorAll('td');
      if (th && tds.length > 0) {
        assignFieldByLabel(th.textContent.trim(), tds[0].textContent.trim(), result);
      } else if (tds.length >= 2) {
        assignFieldByLabel(tds[0].textContent.trim(), tds[1].textContent.trim(), result);
      }
    });

    // 2. Definition lists
    const dlItems = document.querySelectorAll('dl');
    dlItems.forEach(dl => {
      const dts = dl.querySelectorAll('dt');
      const dds = dl.querySelectorAll('dd');
      for (let i = 0; i < Math.min(dts.length, dds.length); i++) {
        assignFieldByLabel(dts[i].textContent.trim(), dds[i].textContent.trim(), result);
      }
    });
  }

  /**
   * Strategy 2: Extract from labeled elements (.label, .title, data-attributes)
   */
  function extractFromLabeledElements(result) {
    const candidateNodes = document.querySelectorAll(
      '.lesson-info, .reservation-info, .class-info, .student-info, .lesson-detail, [class*="info"], [class*="lesson"], [class*="detail"]'
    );

    candidateNodes.forEach(node => {
      const text = node.textContent;
      if (!result.schoolName && /学校|school/i.test(text)) {
        const m = text.match(/(?:学校名?|School(?:\s*Name)?)\s*[:：]\s*([^\n\r\t]+)/i);
        if (m) result.schoolName = cleanValue(m[1]);
      }
      if (!result.studentName && /生徒|student/i.test(text)) {
        const m = text.match(/(?:生徒名?|Student(?:'s)?(?:\s*name)?|受講者)\s*[:：]\s*([^\n\r\t]+)/i);
        if (m) result.studentName = cleanValue(m[1]);
      }
      if (!result.teacherName && /講師|teacher/i.test(text)) {
        const m = text.match(/(?:講師名?|Teacher(?:\s*Name)?)\s*[:：]\s*([^\n\r\t]+)/i);
        if (m) result.teacherName = cleanValue(m[1]);
      }
      if (!result.classType && /クラス|コース|教材|class|course/i.test(text)) {
        const m = text.match(/(?:クラス|コース|教材|Class|Course)\s*[:：]\s*([^\n\r\t]+)/i);
        if (m) result.classType = cleanValue(m[1]);
      }
    });
  }

  /**
   * Strategy 3: Inspect Kimini Lesson Room (KR) navigation header/sidebar
   */
  function extractFromClassroomHeader(result) {
    // Check specific class elements commonly used in Glats/Kimini KR
    const selectors = [
      { sel: '.room-header, .header-lesson, .classroom-info, #header_lesson_info', field: 'auto' },
      { sel: '.student-name, #student_name, [data-student-name]', field: 'studentName' },
      { sel: '.teacher-name, #teacher_name, [data-teacher-name]', field: 'teacherName' },
      { sel: '.school-name, #school_name, [data-school-name]', field: 'schoolName' },
      { sel: '.course-title, .material-title, .lesson-name', field: 'classType' },
      { sel: '.lesson-time, .schedule-time', field: 'time' }
    ];

    selectors.forEach(item => {
      const el = document.querySelector(item.sel);
      if (el) {
        const val = cleanValue(el.textContent);
        if (val) {
          if (item.field !== 'auto' && !result[item.field]) {
            result[item.field] = val;
          }
        }
      }
    });
  }

  /**
   * Strategy 4: Global regex fallback across document body text
   */
  function extractFromPageTextRegex(result) {
    const fullText = document.body ? document.body.innerText : '';
    if (!fullText) return;

    // 1. School Pattern (e.g., Fujimigaoka from Fujimigaoka/2026/Jr3 or School: Name)
    if (!result.schoolName) {
      // Look for format like SchoolName/YYYY/Jr# or School: Name
      const schoolPattern = /(?:School|学校名?)\s*[:：]\s*([A-Za-z0-9_\-\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf\/]+)/i;
      const schoolMatch = fullText.match(schoolPattern);
      if (schoolMatch) {
        result.schoolName = sanitizeSchoolNameOnly(cleanValue(schoolMatch[1]));
      } else {
        // Look for standalone structured pattern e.g. "Fujimigaoka/2026/Jr3" -> captures "Fujimigaoka"
        const hierarchicalSchool = /\b([A-Za-z0-9_\-\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]{3,35})\/\d{4}\/(?:Jr|Sr|Grade|J|S)\d+\b/i;
        const hierMatch = fullText.match(hierarchicalSchool);
        if (hierMatch) {
          result.schoolName = hierMatch[1].trim();
        }
      }
    }

    // 2. Student Name
    if (!result.studentName) {
      const studentMatch = fullText.match(/(?:Student(?:'s)?\s*name|生徒名?|受講者|ニックネーム)\s*[:：]\s*([^\n\r\t]+)/i);
      if (studentMatch) {
        result.studentName = cleanValue(studentMatch[1]);
      }
    }

    // 3. Teacher Name
    if (!result.teacherName) {
      const teacherMatch = fullText.match(/(?:Teacher|講師名?|担当講師)\s*[:：]\s*([^\n\r\t]+)/i);
      if (teacherMatch) {
        result.teacherName = cleanValue(teacherMatch[1]);
      }
    }

    // 4. Class / Course
    if (!result.classType) {
      const classMatch = fullText.match(/(?:Class|コース|クラス|教材)\s*[:：]\s*([^\n\r\t]+)/i);
      if (classMatch) {
        result.classType = cleanValue(classMatch[1]);
      }
    }

    // 5. Time Slot (e.g. 11:45-12:10 or 11:45～12:10)
    if (!result.time) {
      const timeMatch = fullText.match(/(\d{1,2}:\d{2}\s*[-~～–]\s*\d{1,2}:\d{2}(?:\s*(?:JST|jst))?)/);
      if (timeMatch) {
        result.time = timeMatch[1].replace(/\s+/g, ' ').trim();
      }
    }

    // 6. Date Pattern (e.g. 2026-09-30, 2026/09/30, 2026年9月30日)
    if (!result.date) {
      const dateMatch = fullText.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}(?:日)?)/);
      if (dateMatch) {
        result.date = dateMatch[1].trim();
      }
    }
  }

  /**
   * Helper to map label string to result fields
   */
  function assignFieldByLabel(label, value, result) {
    if (!label || !value) return;
    const l = label.toLowerCase();
    const val = cleanValue(value);
    if (!val) return;

    if (!result.schoolName && (l.includes('学校') || l.includes('school') || l.includes('団体'))) {
      result.schoolName = val;
    } else if (!result.studentName && (l.includes('生徒') || l.includes('student') || l.includes('ニックネーム') || l.includes('受講者'))) {
      result.studentName = val;
    } else if (!result.teacherName && (l.includes('講師') || l.includes('teacher') || l.includes('tutor'))) {
      result.teacherName = val;
    } else if (!result.classType && (l.includes('コース') || l.includes('クラス') || l.includes('class') || l.includes('course') || l.includes('教材'))) {
      result.classType = val;
    } else if (!result.date && (l.includes('日付') || l.includes('date') || l.includes('レッスン日') || l.includes('受講日'))) {
      result.date = val;
    } else if (!result.time && (l.includes('時間') || l.includes('time') || l.includes('時刻'))) {
      result.time = val;
    }
  }

  /**
   * Clean and normalize raw extracted values
   */
  function cleanValue(str) {
    if (!str) return '';
    return str
      .replace(/^[:：\s-]+/, '') // remove leading colons/spaces
      .replace(/[\n\r\t]+/g, ' ') // replace line breaks with space
      .trim();
  }

  /**
   * Sanitize school name to only mention the school name (strip /YYYY/Jr# or parentheses)
   */
  function sanitizeSchoolNameOnly(str) {
    if (!str) return '';
    let cleaned = str.trim();
    // If it contains slashes, take the first part (the school name)
    if (cleaned.includes('/')) {
      cleaned = cleaned.split('/')[0].trim();
    }
    // Remove parentheses/brackets with year or grade
    cleaned = cleaned.replace(/[\(（][^\)）]+[\)）]/g, '').trim();
    return cleaned;
  }

  /**
   * Normalize date, time, school, and class into Kimini standard report format
   */
  function normalizeResults(result) {
    // Normalize Date: YYYY-MM-DD
    if (result.date) {
      const dMatch = result.date.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
      if (dMatch) {
        const year = dMatch[1];
        const month = dMatch[2].padStart(2, '0');
        const day = dMatch[3].padStart(2, '0');
        result.date = `${year}-${month}-${day}`;
      }
    }

    // Normalize Time: Ensure clean spacing and JST suffix
    if (result.time) {
      let t = result.time.replace(/[~～–]/g, '-').replace(/\s+/g, ' ').trim();
      // If it doesn't end with JST, append JST
      if (!/JST$/i.test(t)) {
        t = `${t}  JST`;
      } else {
        // Ensure standard double spacing before JST if desired
        t = t.replace(/\s*JST$/i, '  JST');
      }
      result.time = t;
    }

    // Normalize Student: Only print English name (strip Japanese text/Kanji/Kana)
    if (result.studentName) {
      result.studentName = extractEnglishNameOnly(result.studentName);
    }

    // Normalize School: Keep clean whitespace
    if (result.schoolName) {
      result.schoolName = cleanValue(result.schoolName);
    }

    // Normalize Class: Default is SP, unless explicitly Regular
    if (result.classType && /regular|通常|標準/i.test(result.classType)) {
      result.classType = 'Regular';
    } else {
      result.classType = 'SP';
    }
  }

  /**
   * Extract only English name, removing Japanese kanji/kana and extra symbols
   */
  function extractEnglishNameOnly(str) {
    if (!str) return '';
    let cleaned = str.trim();

    // 1. If English name is in parentheses e.g. "山田 太郎 (Taro Yamada)"
    const parenMatch = cleaned.match(/[\(（]([A-Za-z\s.'-]+)[\)）]/);
    if (parenMatch && parenMatch[1].trim()) {
      return parenMatch[1].trim();
    }

    // 2. Strip Japanese Unicode characters (Kanji, Hiragana, Katakana, etc.)
    const withoutJapanese = cleaned
      .replace(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]+/g, ' ')
      .replace(/[\(（\)）\[\]【】\/・]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (withoutJapanese.length > 0) {
      return withoutJapanese;
    }

    return cleaned;
  }

  /**
   * Fallback data generator if page scraping fails
   */
  function getFallbackData() {
    return {
      date: new Date().toISOString().split('T')[0],
      time: '',
      classType: '',
      studentName: '',
      feedbackNickname: '',
      teacherName: '',
      schoolName: '',
      url: window.location.href,
      matched: false
    };
  }
})();
