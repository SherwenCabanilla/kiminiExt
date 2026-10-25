// QA script: stubs chrome APIs, loads popup.html, and checks report and feedback behavior.
import { fileURLToPath } from "node:url";

export default async function run(page, ui) {
  // Stub chrome.* APIs before popup.js runs.
  await page.addInitScript(() => {
    window.chrome = {
      storage: {
        local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() },
      },
      tabs: {
        query: async (query) =>
          query.active
            ? [{ id: 1, url: "https://teacher.glats.online/room/123" }]
            : [
                { id: 1, url: "https://teacher.glats.online/room/123" },
                { id: 2, url: "https://teacher.glats.online/" },
              ],
        sendMessage: (id, msg, cb) => {
          if (id === 2) {
            const matchesLesson =
              window.__dashboardMatchEnabled &&
              msg.lessonMatch?.date === "2026-10-26" &&
              msg.lessonMatch?.time === "09:00-09:25  JST";
            chrome.runtime.lastError = null;
            cb({
              success: true,
              data: {
                studentName: "Full Dashboard Name",
                matchedDashboardStudent: matchesLesson,
              },
            });
            return;
          }

          if (window.__kiminiExtractorMessageHandler) {
            chrome.runtime.lastError = null;
            window.__kiminiExtractorMessageHandler(msg, {}, cb);
          } else if (cb) {
            cb(undefined);
          }
        },
      },
      scripting: { executeScript: async () => {} },
      runtime: {
        lastError: { message: "stub" },
        onMessage: {
          addListener: (listener) => {
            window.__kiminiExtractorMessageHandler = listener;
          },
          removeListener: () => {},
        },
      },
    };
  });

  await page.setViewportSize({ width: 440, height: 590 });
  await page.goto(new URL("./popup.html", import.meta.url).href);
  await page.waitForTimeout(400);

  const results = {};

  // --- Check 1: Regular class drops the School line ---
  await page.selectOption("#selectClass", "Regular");
  await page.waitForTimeout(150);
  results.regular_preview = await page.$eval(
    "#previewText",
    (el) => el.textContent,
  );
  results.regular_has_school = /School\s*:/i.test(results.regular_preview);
  results.regular_school_field_hidden = await page.$eval("#inputSchool", (el) =>
    el.closest(".field-group").classList.contains("hidden"),
  );

  // --- Check 2: Custom class drops the School line ---
  await page.selectOption("#selectClass", "Custom");
  await page.waitForTimeout(150);
  results.custom_preview = await page.$eval(
    "#previewText",
    (el) => el.textContent,
  );
  results.custom_has_school = /School\s*:/i.test(results.custom_preview);

  // --- Check 3: SP class keeps the School line ---
  await page.selectOption("#selectClass", "SP");
  await page.fill("#inputSchool", "Fujimigaoka");
  await page.waitForTimeout(150);
  results.sp_preview = await page.$eval("#previewText", (el) => el.textContent);
  results.sp_has_school = /School\s*:/i.test(results.sp_preview);
  results.sp_school_field_visible = await page.$eval(
    "#inputSchool",
    (el) => !el.closest(".field-group").classList.contains("hidden"),
  );

  // --- Check 4: Copy button visible without scrolling ---
  const layout = await page.evaluate(() => {
    const btn = document.getElementById("btnCopy");
    const r = btn.getBoundingClientRect();
    const vh = window.innerHeight;
    return {
      innerHeight: vh,
      scrollHeight: document.documentElement.scrollHeight,
      bodyOverflow: getComputedStyle(document.body).overflowY,
      btnTop: Math.round(r.top),
      btnBottom: Math.round(r.bottom),
      btnFullyVisible: r.top >= 0 && r.bottom <= vh,
      pageScrollTop: window.scrollY,
    };
  });
  results.layout = layout;
  results.copy_visible_without_scroll =
    layout.btnFullyVisible && layout.pageScrollTop === 0;

  // --- Check 5: Dashboard full name wins; room nickname is the fallback ---
  await page.evaluate(() => {
    window.__dashboardMatchEnabled = true;
    const lessonDetails = document.createElement("div");
    lessonDetails.textContent =
      "Date: 2026-10-26 Time: 09:00-09:25 JST Student's name: Room Nickname";
    document.body.appendChild(lessonDetails);
  });
  await page.addScriptTag({
    path: fileURLToPath(new URL("./content.js", import.meta.url)),
  });
  await page.click("#btnPullData");
  await page.waitForTimeout(150);
  results.report_uses_dashboard_full_name = await page.$eval(
    "#inputStudent",
    (el) => el.value === "Full Dashboard Name",
  );
  await page.evaluate(() => {
    const nickname = document.createElement("span");
    nickname.className = "gvt-slidenavi__student-text";
    nickname.dataset.id = "nickname";
    nickname.textContent = "Room Nickname";
    document.body.appendChild(nickname);
  });
  await page.click("#btnFeedback");
  await page.waitForTimeout(150);
  await page.check('#feedbackChecklist input[type="checkbox"]');
  results.feedback_uses_room_nickname = await page.$eval(
    "#feedbackPreview",
    (el) => el.textContent.includes("Student: Room Nickname"),
  );
  await page.click("#btnBackToReport");
  await page.evaluate(() => {
    window.__dashboardMatchEnabled = false;
  });
  await page.click("#btnPullData");
  await page.waitForTimeout(150);
  results.report_falls_back_to_room_nickname = await page.$eval(
    "#inputStudent",
    (el) => el.value === "Room Nickname",
  );
  await page.evaluate(() => {
    window.__dashboardMatchEnabled = true;
    document
      .querySelector('.gvt-slidenavi__student-text[data-id="nickname"]')
      .remove();
    const studentLink = document.createElement("a");
    studentLink.href = "/student/295880044";
    studentLink.className = "bold plain";
    studentLink.textContent = "Takuma";
    document.body.appendChild(studentLink);
  });
  await page.click("#btnPullData");
  await page.waitForTimeout(150);
  await page.click("#btnFeedback");
  await page.waitForTimeout(150);
  results.feedback_falls_back_to_room_student_link = await page.$eval(
    "#feedbackPreview",
    (el) => el.textContent.includes("Student: Takuma"),
  );

  return results;
}
