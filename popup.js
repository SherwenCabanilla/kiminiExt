/**
 * Kimini Lesson Report Generator - Popup Script
 * Handles extraction, field updates, preset selection, clipboard copying, and local storage.
 */

const DEFAULT_TEMPLATE = `Date: {Date} 
Time: {Time}

Class: {Class}
Student's name: {StudentName}
Teacher: {Teacher}
School: {School}

Details: {Details}`;

const DEFAULT_PRESETS = [
  "The student hasn't entered the KR yet.",
  "The student left Kimini and hasn't come back yet.",
  "The student couldn't hear me. We refreshed many times, but the issue still existed. I checked my end and everything was fine.",
  "I could hear the student, but the student couldn't hear me. I checked my end and everything was fine.",
  "We couldn't proceed with the lesson because the student seemed to have an internet connection issue. I checked my end and everything was fine."
];

// App State
let appSettings = {
  themeColor: '#0284c7',
  customPresets: [],
  builtinPresetOverrides: {},
  deletedBuiltinPresets: [],
  customFeedbackItems: [],
  builtinFeedbackOverrides: {},
  deletedBuiltinFeedback: []
};
let editingFeedbackIndex = null;
let editingBuiltinFeedback = null;
let editingPreset = null;
let feedbackStudentNickname = '';

// DOM Elements
const elements = {
  statusBadge: document.getElementById('statusBadge'),
  btnPullData: document.getElementById('btnPullData'),
  btnReset: document.getElementById('btnReset'),
  btnSettings: document.getElementById('btnSettings'),
  btnCopy: document.getElementById('btnCopy'),
  copyBtnText: document.getElementById('copyBtnText'),
  copyIcon: document.getElementById('copyIcon'),
  toast: document.getElementById('toast'),

  // Inputs
  inputDate: document.getElementById('inputDate'),
  inputTime: document.getElementById('inputTime'),
  selectClass: document.getElementById('selectClass'),
  inputCustomClass: document.getElementById('inputCustomClass'),
  inputStudent: document.getElementById('inputStudent'),
  inputTeacher: document.getElementById('inputTeacher'),
  inputSchool: document.getElementById('inputSchool'),
  selectIssue: document.getElementById('selectIssue'),
  inputDetails: document.getElementById('inputDetails'),
  previewText: document.getElementById('previewText'),
  previewLength: document.getElementById('previewLength'),

  // Add Preset Modal
  btnOpenAddPreset: document.getElementById('btnOpenAddPreset'),
  modalAddPreset: document.getElementById('modalAddPreset'),
  btnCloseAddPreset: document.getElementById('btnCloseAddPreset'),
  btnCancelAddPreset: document.getElementById('btnCancelAddPreset'),
  btnSavePreset: document.getElementById('btnSavePreset'),
  newPresetText: document.getElementById('newPresetText'),
  presetModalTitle: document.getElementById('presetModalTitle'),
  presetManagerList: document.getElementById('presetManagerList'),

  // Settings Drawer
  settingsDrawer: document.getElementById('settingsDrawer'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  btnSaveSettings: document.getElementById('btnSaveSettings'),
  settingThemeColor: document.getElementById('settingThemeColor'),
  colorSwatches: document.getElementById('colorSwatches'),

  // Feedback View
  btnFeedback: document.getElementById('btnFeedback'),
  reportView: document.getElementById('reportView'),
  feedbackView: document.getElementById('feedbackView'),
  btnBackToReport: document.getElementById('btnBackToReport'),
  feedbackChecklist: document.getElementById('feedbackChecklist'),
  newFeedbackItem: document.getElementById('newFeedbackItem'),
  btnAddFeedbackItem: document.getElementById('btnAddFeedbackItem'),
  btnCancelFeedbackEdit: document.getElementById('btnCancelFeedbackEdit'),
  feedbackPreview: document.getElementById('feedbackPreview'),
  feedbackCount: document.getElementById('feedbackCount'),
  btnCopyFeedback: document.getElementById('btnCopyFeedback'),
  copyFeedbackBtnText: document.getElementById('copyFeedbackBtnText')
};

// Initialize Extension Popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  populatePresetsDropdown();
  initializeDefaultFormValues();
  await pullDataFromActiveTab(false); // Initial auto-pull attempt
  updatePreview();
});

/**
 * Load settings from chrome.storage.local
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        'themeColor',
        'customPresets',
        'builtinPresetOverrides',
        'deletedBuiltinPresets',
        'customFeedbackItems',
        'builtinFeedbackOverrides',
        'deletedBuiltinFeedback'
      ],
      (result) => {
        if (result.themeColor !== undefined) appSettings.themeColor = result.themeColor;
        if (Array.isArray(result.customPresets)) appSettings.customPresets = result.customPresets;
        if (result.builtinPresetOverrides && typeof result.builtinPresetOverrides === 'object') {
          appSettings.builtinPresetOverrides = result.builtinPresetOverrides;
        }
        if (Array.isArray(result.deletedBuiltinPresets)) {
          appSettings.deletedBuiltinPresets = result.deletedBuiltinPresets;
        }
        if (Array.isArray(result.customFeedbackItems)) {
          appSettings.customFeedbackItems = result.customFeedbackItems;
        }
        if (result.builtinFeedbackOverrides && typeof result.builtinFeedbackOverrides === 'object') {
          appSettings.builtinFeedbackOverrides = result.builtinFeedbackOverrides;
        }
        if (Array.isArray(result.deletedBuiltinFeedback)) {
          appSettings.deletedBuiltinFeedback = result.deletedBuiltinFeedback;
        }
        renderBuiltinFeedbackItems();
        renderCustomFeedbackItems();
        applyThemeColor(appSettings.themeColor);
        resolve();
      }
    );
  });
}

/**
 * Set up all DOM event listeners
 */
function setupEventListeners() {
  const on = (element, eventName, handler) => {
    if (element && typeof element.addEventListener === 'function') {
      element.addEventListener(eventName, handler);
    }
  };

  // Input changes -> Update Preview
  const watchedInputs = [
    elements.inputDate,
    elements.inputTime,
    elements.inputCustomClass,
    elements.inputStudent,
    elements.inputTeacher,
    elements.inputSchool,
    elements.inputDetails
  ];

  watchedInputs.forEach(input => {
    on(input, 'input', updatePreview);
  });

  // Class Dropdown Change (SP / Regular / Custom)
  on(elements.selectClass, 'change', (e) => {
    if (e.target.value === 'Custom') {
      elements.inputCustomClass.classList.remove('hidden');
      elements.inputCustomClass.focus();
    } else {
      elements.inputCustomClass.classList.add('hidden');
    }
    toggleSchoolFieldVisibility();
    updatePreview();
  });

  // Student input: auto-sanitize on blur to keep English name only (strips Japanese text)
  on(elements.inputStudent, 'blur', () => {
    const cleaned = extractEnglishNameOnly(elements.inputStudent.value);
    if (cleaned !== elements.inputStudent.value) {
      elements.inputStudent.value = cleaned;
      updatePreview();
    }
  });

  // School/course field: keep full matching course values such as "Kinjo/2026/Jr1".
  on(elements.inputSchool, 'blur', () => {
    const cleaned = cleanSchoolOrCourseValue(elements.inputSchool.value);
    if (cleaned !== elements.inputSchool.value) {
      elements.inputSchool.value = cleaned;
      updatePreview();
    }
  });

  // Pull Data Button
  on(elements.btnPullData, 'click', () => {
    pullDataFromActiveTab(true);
  });

  // Reset Button
  on(elements.btnReset, 'click', () => {
    initializeDefaultFormValues();
    updatePreview();
    showToast('Form reset to defaults');
  });

  // Preset Selector change
  on(elements.selectIssue, 'change', (e) => {
    const val = e.target.value;
    e.target.title = e.target.selectedOptions[0]?.title || val;
    if (val) {
      elements.inputDetails.value = val;
      updatePreview();
    }
  });

  // Copy to Clipboard
  on(elements.btnCopy, 'click', copyReportToClipboard);

  // Add Custom Preset Modal
  on(elements.btnOpenAddPreset, 'click', () => {
    editingPreset = null;
    elements.presetModalTitle.textContent = 'Add Custom Detail Preset';
    elements.btnSavePreset.textContent = 'Save & Select';
    elements.newPresetText.value = '';
    elements.modalAddPreset.classList.remove('hidden');
    elements.newPresetText.focus();
  });

  on(elements.btnCloseAddPreset, 'click', () => {
    editingPreset = null;
    elements.modalAddPreset.classList.add('hidden');
  });

  on(elements.btnCancelAddPreset, 'click', () => {
    editingPreset = null;
    elements.modalAddPreset.classList.add('hidden');
  });

  on(elements.btnSavePreset, 'click', saveNewCustomPreset);
  on(elements.presetManagerList, 'click', handlePresetManagerAction);

  // Settings Drawer
  on(elements.btnSettings, 'click', openSettingsDrawer);
  on(elements.btnCloseSettings, 'click', () => {
    elements.settingsDrawer.classList.add('hidden');
  });
  on(elements.btnSaveSettings, 'click', saveSettingsFromDrawer);
  on(elements.settingThemeColor, 'input', (e) => {
    applyThemeColor(e.target.value);
  });
  on(elements.colorSwatches, 'click', (e) => {
    const swatch = e.target.closest('[data-color]');
    if (!swatch) return;
    const color = swatch.dataset.color;
    elements.settingThemeColor.value = color;
    applyThemeColor(color);
  });

  // ===== Feedback View =====
  // Toggle to Feedback View
  on(elements.btnFeedback, 'click', async () => {
    elements.reportView.classList.add('hidden');
    elements.feedbackView.classList.remove('hidden');
    await refreshFeedbackNicknameFromOpenTabs();
    updateFeedbackPreview();
  });

  // Back to Report View
  on(elements.btnBackToReport, 'click', () => {
    elements.feedbackView.classList.add('hidden');
    elements.reportView.classList.remove('hidden');
  });

  // Checkbox changes -> update preview
  on(elements.feedbackChecklist, 'change', updateFeedbackPreview);
  on(elements.inputStudent, 'input', updateFeedbackPreview);
  on(elements.btnAddFeedbackItem, 'click', addCustomFeedbackItem);
  on(elements.btnCancelFeedbackEdit, 'click', cancelCustomFeedbackEdit);
  on(elements.feedbackChecklist, 'click', (event) => {
    const button = event.target.closest('button[data-feedback-action]');
    if (!button) return;
    event.preventDefault();

    if (button.dataset.feedbackType === 'builtin') {
      if (button.dataset.feedbackAction === 'edit') {
        startBuiltinFeedbackEdit(button.dataset.originalFeedback);
      } else if (button.dataset.feedbackAction === 'delete') {
        deleteBuiltinFeedbackItem(button.dataset.originalFeedback);
      }
      return;
    }

    const index = Number(button.dataset.feedbackIndex);
    if (button.dataset.feedbackAction === 'edit') {
      startCustomFeedbackEdit(index);
    } else if (button.dataset.feedbackAction === 'delete') {
      deleteCustomFeedbackItem(index);
    }
  });

  // Copy Feedback
  on(elements.btnCopyFeedback, 'click', copyFeedbackToClipboard);
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
 * Clean school/course value while preserving full matched course names.
 */
function cleanSchoolOrCourseValue(str) {
  if (!str) return '';
  let cleaned = str.trim();
  cleaned = cleaned.replace(/[\(（][^\)）]+[\)）]/g, '').trim();
  return cleaned;
}

/**
 * Initialize default form values
 */
function initializeDefaultFormValues() {
  const today = new Date().toISOString().split('T')[0];
  elements.inputDate.value = today;
  elements.inputTime.value = '11:45-12:10  JST';
  elements.selectClass.value = 'SP';
  elements.inputCustomClass.value = '';
  elements.inputCustomClass.classList.add('hidden');
  elements.inputStudent.value = '';
  elements.inputTeacher.value = '';
  elements.inputSchool.value = '';
  const firstPreset = getActivePresets()[0];
  elements.inputDetails.value = firstPreset ? firstPreset.value : '';
  toggleSchoolFieldVisibility();

  populatePresetsDropdown(firstPreset ? firstPreset.value : null);
  if (elements.selectIssue.options.length > 0) {
    elements.selectIssue.selectedIndex = 0;
  }
}

/**
 * Populate Preset Dropdown (Built-in + Custom)
 */
function populatePresetsDropdown(selectedValue = null) {
  elements.selectIssue.innerHTML = '';
  const builtIns = getActivePresets().filter((preset) => preset.type === 'builtin');
  const customs = getActivePresets().filter((preset) => preset.type === 'custom');

  appendPresetOptions('Standard Issues & Notes', builtIns);
  appendPresetOptions('Custom Presets', customs);
  renderPresetManager();

  if (selectedValue && Array.from(elements.selectIssue.options).some((option) => option.value === selectedValue)) {
    elements.selectIssue.value = selectedValue;
  } else if (elements.selectIssue.options.length > 0) {
    elements.selectIssue.selectedIndex = 0;
  }
  elements.selectIssue.title = elements.selectIssue.selectedOptions[0]?.title || '';
}

function getActivePresets() {
  const builtIns = DEFAULT_PRESETS
    .filter((preset) => !appSettings.deletedBuiltinPresets.includes(preset))
    .map((original) => ({
      type: 'builtin',
      original,
      value: appSettings.builtinPresetOverrides[original] || original
    }));
  const customs = appSettings.customPresets.map((value) => ({
    type: 'custom',
    original: value,
    value
  }));
  return [...builtIns, ...customs];
}

function appendPresetOptions(label, presets) {
  if (presets.length === 0) return;
  const group = document.createElement('optgroup');
  group.label = label;
  presets.forEach(({ value }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value.length > 55 ? `${value.substring(0, 52)}...` : value;
    option.title = value;
    group.appendChild(option);
  });
  elements.selectIssue.appendChild(group);
}

function renderPresetManager() {
  elements.presetManagerList.replaceChildren();
  getActivePresets().forEach((preset) => {
    const row = document.createElement('div');
    row.className = 'preset-manager-item';

    const text = document.createElement('span');
    text.className = 'preset-manager-text';
    text.textContent = preset.value;
    text.title = preset.value;

    const actions = document.createElement('span');
    actions.className = 'preset-manager-actions';
    actions.append(
      createPresetActionButton('edit', 'Edit preset', preset.type, preset.original),
      createPresetActionButton('delete', 'Delete preset', preset.type, preset.original)
    );

    row.append(text, actions);
    elements.presetManagerList.appendChild(row);
  });
}

function createPresetActionButton(action, label, type, original) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `feedback-option-action feedback-option-${action}`;
  button.dataset.presetAction = action;
  button.dataset.presetType = type;
  button.dataset.presetOriginal = original;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = action === 'edit'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="m19 6-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path></svg>';
  return button;
}

function handlePresetManagerAction(event) {
  const button = event.target.closest('button[data-preset-action]');
  if (!button) return;

  const { presetAction, presetType, presetOriginal } = button.dataset;
  if (presetAction === 'edit') {
    startPresetEdit(presetType, presetOriginal);
  } else if (presetAction === 'delete') {
    deletePreset(presetType, presetOriginal);
  }
}

/**
 * Pull and extract lesson data from the active browser tab
 */
async function pullDataFromActiveTab(isManualClick = false) {
  try {
    const [activeTabs, allTabs] = await Promise.all([
      chrome.tabs.query({ active: true, currentWindow: true }),
      chrome.tabs.query({})
    ]);
    const tab = activeTabs[0];
    if (!tab || !tab.id) {
      setConnectionStatus(false, 'No active tab');
      return;
    }

    const isKiminiPage = isKiminiOrGlatsPage(tab.url);
    const activeData = await requestTabExtraction(tab);
    if (!activeData) {
      handleExtractionFallback(isKiminiPage, isManualClick);
      return;
    }

    if (!isDashboardPage(tab.url) && activeData.date && activeData.time) {
      const dashboardTabs = allTabs.filter((candidate) =>
        candidate.id !== tab.id && isDashboardPage(candidate.url)
      );

      for (const dashboardTab of dashboardTabs) {
        const dashboardData = await requestTabExtraction(dashboardTab, {
          date: activeData.date,
          time: activeData.time,
          studentName: activeData.studentName
        });
        if (dashboardData && dashboardData.matchedDashboardStudent && dashboardData.studentName) {
          activeData.studentName = dashboardData.studentName;
          if (dashboardData.classType) activeData.classType = dashboardData.classType;
          break;
        }
      }
    }

    applyExtractedData(activeData, isKiminiPage, isManualClick);
  } catch (err) {
    console.warn('Tab query error:', err);
    setConnectionStatus(false, 'Manual Mode');
  }
}

function isKiminiOrGlatsPage(url = '') {
  return /(?:kimini\.online|glats\.online)/i.test(url);
}

function isDashboardPage(url = '') {
  return /(?:^|\/\/)teacher\.glats\.online\/?(?:[?#]|$)/i.test(url) ||
    (isKiminiOrGlatsPage(url) && /dashboard/i.test(url));
}

async function refreshFeedbackNicknameFromOpenTabs() {
  feedbackStudentNickname = '';

  try {
    // The feedback belongs to the page currently open behind the popup. Do
    // not scan every lesson tab: their order is not meaningful and can select
    // a different student's name.
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id || !isKiminiOrGlatsPage(activeTab.url) || isDashboardPage(activeTab.url)) {
      showToast('Open the student lesson tab before creating feedback');
      return;
    }

    const data = await requestTabExtraction(activeTab);
    if (data && typeof data.feedbackNickname === 'string' && data.feedbackNickname.trim()) {
      feedbackStudentNickname = data.feedbackNickname.trim();
      return;
    }

    showToast('Could not find a student nickname in the active lesson tab');
  } catch (err) {
    console.warn('Could not read the student nickname from the active lesson tab:', err);
    showToast('Could not read the student nickname from the active lesson tab');
  }
}

function requestTabExtraction(tab, lessonMatch = null) {
  if (!tab.id) return Promise.resolve(null);

  return new Promise((resolve) => {
    const sendRequest = (allowInjection) => {
      chrome.tabs.sendMessage(
        tab.id,
        { action: 'extract_kimini_data', lessonMatch },
        async (response) => {
          if (!chrome.runtime.lastError && response && response.success) {
            resolve(response.data);
            return;
          }

          if (!allowInjection) {
            resolve(null);
            return;
          }

          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
            });
            sendRequest(false);
          } catch (injectionError) {
            console.warn(`Could not read tab ${tab.id}:`, injectionError);
            resolve(null);
          }
        }
      );
    };

    sendRequest(true);
  });
}

/**
 * Handle data extracted from page
 */
function applyExtractedData(data, isKiminiPage, isManualClick) {
  let fieldsUpdated = 0;

  if (typeof data.feedbackNickname === 'string') {
    feedbackStudentNickname = data.feedbackNickname;
  }

  if (data.date) {
    elements.inputDate.value = data.date;
    fieldsUpdated++;
  }
  if (data.time) {
    elements.inputTime.value = data.time;
    fieldsUpdated++;
  }
  if (data.classType) {
    const rawClass = data.classType.trim();
    if (/regular|通常|標準/i.test(rawClass)) {
      // Automatic classification is disabled: all extracted lessons start as SP.
      elements.selectClass.value = 'SP';
    } else {
      elements.selectClass.value = 'SP';
    }
    elements.inputCustomClass.classList.add('hidden');
    fieldsUpdated++;
  } else {
    elements.selectClass.value = 'SP';
    elements.inputCustomClass.classList.add('hidden');
  }
  toggleSchoolFieldVisibility();
  const isRegularClass = elements.selectClass.value === 'Regular';
  if (isRegularClass) {
    // Regular reports do not use a school name, including a JP source tag.
    elements.inputSchool.value = '';
  }
  if (data.studentName) {
    elements.inputStudent.value = extractEnglishNameOnly(data.studentName);
    fieldsUpdated++;
  }
  if (data.teacherName) {
    elements.inputTeacher.value = data.teacherName;
    fieldsUpdated++;
  }
  if (data.schoolName && !isRegularClass) {
    elements.inputSchool.value = cleanSchoolOrCourseValue(data.schoolName);
    fieldsUpdated++;
  }

  setConnectionStatus(true, isKiminiPage ? 'Kimini Page Connected' : 'Data Extracted');
  updatePreview();

  if (isManualClick) {
    showToast(fieldsUpdated > 0 ? `Extracted ${fieldsUpdated} fields from page!` : 'Page scanned (no fields found)');
  }
}

/**
 * Fallback when extraction could not find content script
 */
function handleExtractionFallback(isKiminiPage, isManualClick) {
  if (isKiminiPage) {
    setConnectionStatus(true, 'Kimini Page Detected');
    if (isManualClick) showToast('Kimini page detected - adjust fields if needed');
  } else {
    setConnectionStatus(false, 'Manual Mode');
    if (isManualClick) showToast('Not on Kimini page (Manual mode ready)');
  }
  updatePreview();
}

/**
 * Update UI status badge
 */
function setConnectionStatus(connected, text) {
  elements.statusBadge.textContent = text;
  elements.statusBadge.className = 'status-indicator ' + (connected ? 'connected' : 'manual');
}

/**
 * Assemble and format report output
 */
function updatePreview() {
  const dateVal = elements.inputDate.value.trim();
  const timeVal = elements.inputTime.value.trim();

  let classVal = elements.selectClass.value;
  if (classVal === 'Custom') {
    classVal = elements.inputCustomClass.value.trim() || 'Custom';
  }

  const studentVal = extractEnglishNameOnly(elements.inputStudent.value.trim());
  const teacherVal = elements.inputTeacher.value.trim();
  const schoolVal = cleanSchoolOrCourseValue(elements.inputSchool.value.trim());
  const detailsVal = elements.inputDetails.value.trim();

  // School is only reported for SP classes. For Regular/Custom, drop the line entirely.
  const includeSchool = elements.selectClass.value === 'SP';

  let output = DEFAULT_TEMPLATE;

  output = output
    .replace(/{Date}/g, dateVal)
    .replace(/{Time}/g, timeVal)
    .replace(/{Class}/g, classVal)
    .replace(/{StudentName}/g, studentVal)
    .replace(/{Teacher}/g, teacherVal)
    .replace(/{Details}/g, detailsVal);

  if (includeSchool) {
    output = output.replace(/{School}/g, schoolVal);
  } else {
    // Remove the whole "School: ..." line (and its trailing newline) from the report.
    output = output.replace(/^\s*School\s*:[^\n]*\n?/gmi, '');
  }

  elements.previewText.textContent = output;
  elements.previewLength.textContent = `${output.length} chars`;
}

/**
 * Show the School field only for SP classes; hide it for Regular / Custom.
 */
function toggleSchoolFieldVisibility() {
  const schoolGroup = elements.inputSchool ? elements.inputSchool.closest('.field-group') : null;
  if (!schoolGroup) return;
  const isSP = elements.selectClass.value === 'SP';
  schoolGroup.classList.toggle('hidden', !isSP);
}

/**
 * Copy formatted report to clipboard with instant feedback
 */
async function copyReportToClipboard() {
  const textToCopy = elements.previewText.textContent;
  if (!textToCopy) return;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(textToCopy);
    } else {
      // Fallback method
      const tempArea = document.createElement('textarea');
      tempArea.value = textToCopy;
      document.body.appendChild(tempArea);
      tempArea.select();
      document.execCommand('copy');
      document.body.removeChild(tempArea);
    }

    // Visual button success state
    elements.btnCopy.classList.add('copied');
    elements.copyBtnText.textContent = 'Copied to Clipboard!';
    showToast('Copied to clipboard!');

    setTimeout(() => {
      elements.btnCopy.classList.remove('copied');
      elements.copyBtnText.textContent = 'Copy to Clipboard';
    }, 2000);
  } catch (err) {
    console.error('Copy failed:', err);
    showToast('Failed to copy. Please select text manually.');
  }
}

/**
 * Save new custom preset from modal
 */
function saveNewCustomPreset() {
  const text = elements.newPresetText.value.trim();
  if (!text) {
    elements.newPresetText.focus();
    return;
  }

  const duplicate = getActivePresets().some((preset) => {
    const sameText = preset.value.toLowerCase() === text.toLowerCase();
    const isCurrentPreset = editingPreset &&
      preset.type === editingPreset.type &&
      preset.original === editingPreset.original;
    return sameText && !isCurrentPreset;
  });
  if (duplicate) {
    showToast('That preset already exists');
    return;
  }

  const oldValue = editingPreset
    ? getActivePresets().find((preset) =>
      preset.type === editingPreset.type && preset.original === editingPreset.original
    )?.value
    : null;
  const wasSelected = oldValue && elements.selectIssue.value === oldValue;
  const wasInDetails = oldValue && elements.inputDetails.value.trim() === oldValue;

  if (editingPreset?.type === 'builtin') {
    const overrides = { ...appSettings.builtinPresetOverrides, [editingPreset.original]: text };
    persistPresetChanges({ builtinPresetOverrides: overrides }, () => {
      finishPresetSave(text, wasSelected, wasInDetails, 'Preset updated');
    });
    return;
  }

  const presets = [...appSettings.customPresets];
  if (editingPreset?.type === 'custom') {
    const index = presets.indexOf(editingPreset.original);
    if (index === -1) return;
    presets[index] = text;
  } else {
    presets.push(text);
  }

  persistPresetChanges({ customPresets: presets }, () => {
    const isNewPreset = !editingPreset;
    finishPresetSave(
      text,
      Boolean(wasSelected) || isNewPreset,
      Boolean(wasInDetails) || isNewPreset,
      isNewPreset ? 'Custom detail preset saved!' : 'Preset updated'
    );
  });
}

function finishPresetSave(text, wasSelected, wasInDetails, message) {
  const currentSelection = wasSelected ? text : elements.selectIssue.value;
  populatePresetsDropdown(currentSelection);
  if (wasSelected) elements.selectIssue.value = text;
  elements.selectIssue.title = elements.selectIssue.selectedOptions[0]?.title || '';
  if (wasInDetails || !editingPreset) elements.inputDetails.value = text;
  elements.modalAddPreset.classList.add('hidden');
  editingPreset = null;
  elements.presetModalTitle.textContent = 'Add Custom Detail Preset';
  elements.btnSavePreset.textContent = 'Save & Select';
  updatePreview();
  showToast(message);
}

function startPresetEdit(type, original) {
  const preset = getActivePresets().find((item) => item.type === type && item.original === original);
  if (!preset) return;

  editingPreset = { type, original };
  elements.presetModalTitle.textContent = 'Edit Saved Preset';
  elements.btnSavePreset.textContent = 'Save Changes';
  elements.newPresetText.value = preset.value;
  elements.modalAddPreset.classList.remove('hidden');
  elements.newPresetText.focus();
}

function deletePreset(type, original) {
  const preset = getActivePresets().find((item) => item.type === type && item.original === original);
  if (!preset) return;

  const confirmed = window.confirm(`Delete this saved preset?\n\n${preset.value}`);
  if (!confirmed) return;

  const wasSelected = elements.selectIssue.value === preset.value;
  if (type === 'builtin') {
    const deleted = [...appSettings.deletedBuiltinPresets, original];
    persistPresetChanges({ deletedBuiltinPresets: deleted }, () => {
      finishPresetDelete(wasSelected);
    });
    return;
  }

  const presets = appSettings.customPresets.filter((item) => item !== original);
  persistPresetChanges({ customPresets: presets }, () => {
    finishPresetDelete(wasSelected);
  });
}

function finishPresetDelete(wasSelected) {
  const fallback = wasSelected
    ? getActivePresets()[0]?.value || null
    : elements.selectIssue.value;
  populatePresetsDropdown(fallback);
  elements.selectIssue.title = elements.selectIssue.selectedOptions[0]?.title || '';
  if (wasSelected) {
    elements.inputDetails.value = fallback || '';
    updatePreview();
  }
  showToast('Preset deleted');
}

function persistPresetChanges(changes, onSaved) {
  chrome.storage.local.set(changes, () => {
    if (chrome.runtime.lastError) {
      showToast('Could not save presets');
      console.error('Saving presets failed:', chrome.runtime.lastError.message);
      return;
    }
    if (changes.customPresets) appSettings.customPresets = changes.customPresets;
    if (changes.builtinPresetOverrides) appSettings.builtinPresetOverrides = changes.builtinPresetOverrides;
    if (changes.deletedBuiltinPresets) appSettings.deletedBuiltinPresets = changes.deletedBuiltinPresets;
    onSaved();
  });
}

/**
 * Open Settings Drawer & populate current settings
 */
function openSettingsDrawer() {
  elements.settingThemeColor.value = appSettings.themeColor || '#0284c7';
  updateSelectedSwatch(elements.settingThemeColor.value);
  elements.settingsDrawer.classList.remove('hidden');
}

/**
 * Apply selected UI theme color.
 */
function applyThemeColor(color) {
  const normalizedColor = normalizeHexColor(color) || '#0284c7';
  const root = document.documentElement;
  root.style.setProperty('--primary', normalizedColor);
  root.style.setProperty('--primary-hover', shadeHexColor(normalizedColor, -18));
  root.style.setProperty('--primary-light', shadeHexColor(normalizedColor, 88));
  root.style.setProperty('--primary-border', shadeHexColor(normalizedColor, 70));
  root.style.setProperty('--border-focus', shadeHexColor(normalizedColor, 18));
  updateSelectedSwatch(normalizedColor);
}

function updateSelectedSwatch(color) {
  if (!elements.colorSwatches) return;
  const normalizedColor = normalizeHexColor(color);
  elements.colorSwatches.querySelectorAll('.color-swatch').forEach((swatch) => {
    swatch.classList.toggle('selected', normalizeHexColor(swatch.dataset.color) === normalizedColor);
  });
}

function normalizeHexColor(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color || '')) return '';
  return color.toLowerCase();
}

function shadeHexColor(color, percent) {
  const normalizedColor = normalizeHexColor(color);
  if (!normalizedColor) return color;
  const amount = Math.round(2.55 * percent);
  const num = parseInt(normalizedColor.slice(1), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Save settings from drawer
 */
function saveSettingsFromDrawer() {
  const themeColor = normalizeHexColor(elements.settingThemeColor.value) || '#0284c7';

  appSettings.themeColor = themeColor;
  applyThemeColor(themeColor);

  chrome.storage.local.set(
    {
      themeColor: themeColor
    },
    () => {
      elements.settingsDrawer.classList.add('hidden');
      updatePreview();
      showToast('Settings saved successfully!');
    }
  );
}

/**
 * Show temporary toast message
 */
let toastTimeout;
function showToast(message) {
  clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');

  toastTimeout = setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 2200);
}

// ===== Feedback View Functions =====

/**
 * Get all checked feedback items and build a preview string
 */
function updateFeedbackPreview() {
  const checked = getCheckedFeedbackItems();
  const count = checked.length;

  elements.feedbackCount.textContent = `${count} selected`;

  if (count === 0) {
    elements.feedbackPreview.textContent = 'Select feedback items above...';
    return;
  }

  elements.feedbackPreview.textContent = buildFeedbackText(checked);
}

/**
 * Get values of all checked feedback checkboxes
 */
function getCheckedFeedbackItems() {
  if (!elements.feedbackChecklist) return [];
  const boxes = elements.feedbackChecklist.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(boxes).map(cb => cb.value);
}

/**
 * Copy selected feedback to clipboard with student nickname
 */
async function copyFeedbackToClipboard() {
  const checked = getCheckedFeedbackItems();
  const textToCopy = buildFeedbackText(checked);
  if (!textToCopy) {
    showToast('Please select at least one feedback item');
    return;
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(textToCopy);
    } else {
      const tempArea = document.createElement('textarea');
      tempArea.value = textToCopy;
      document.body.appendChild(tempArea);
      tempArea.select();
      document.execCommand('copy');
      document.body.removeChild(tempArea);
    }

    elements.btnCopyFeedback.classList.add('copied');
    elements.copyFeedbackBtnText.textContent = 'Copied!';
    showToast('Feedback copied to clipboard!');

    setTimeout(() => {
      elements.btnCopyFeedback.classList.remove('copied');
      elements.copyFeedbackBtnText.textContent = 'Copy Feedback';
    }, 2000);
  } catch (err) {
    console.error('Copy failed:', err);
    showToast('Failed to copy. Please select text manually.');
  }
}

function buildFeedbackText(checked) {
  if (checked.length === 0) return '';
  const nickname = extractEnglishNameOnly(feedbackStudentNickname);
  const nameLabel = nickname || '[Student Name]';
  const bulletList = checked.map(item => `- ${item}`).join('\n');
  return `Student: ${nameLabel}\n\nFeedback:\n${bulletList}`;
}

function renderCustomFeedbackItems(checkedItems = new Set(getCheckedFeedbackItems())) {
  elements.feedbackChecklist.querySelectorAll('[data-custom-feedback]').forEach((item) => item.remove());

  appSettings.customFeedbackItems.forEach((value, index) => {
    // A label makes the complete row a checkbox hit area, not only the small
    // checkbox itself. The delegated action handler prevents edit/delete
    // buttons from activating this label.
    const row = document.createElement('label');
    row.className = 'feedback-item custom-feedback-item';
    row.dataset.customFeedback = 'true';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = value;
    checkbox.checked = checkedItems.has(value);

    const text = document.createElement('span');
    text.className = 'custom-feedback-text';
    text.textContent = value;

    const actions = document.createElement('span');
    actions.className = 'custom-feedback-actions';
    actions.append(
      createFeedbackActionButton('edit', 'Edit feedback option', index),
      createFeedbackActionButton('delete', 'Delete feedback option', index)
    );
    row.append(checkbox, text, actions);
    elements.feedbackChecklist.appendChild(row);
  });
}

function renderBuiltinFeedbackItems(checkedItems = new Set(getCheckedFeedbackItems())) {
  elements.feedbackChecklist.querySelectorAll('label.feedback-item:not([data-custom-feedback])').forEach((row) => {
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (!checkbox) return;

    if (row.dataset.builtinFeedbackRendered !== 'true') {
      const original = checkbox.value.trim() || row.textContent.trim();
      checkbox.dataset.originalFeedback = original;
      row.dataset.originalFeedback = original;
      row.dataset.builtinFeedbackRendered = 'true';
    }

    const original = row.dataset.originalFeedback;
    if (appSettings.deletedBuiltinFeedback.includes(original)) {
      row.remove();
      return;
    }

    const value = appSettings.builtinFeedbackOverrides[original] || original;
    checkbox.value = value;
    checkbox.checked = checkedItems.has(value);

    let text = row.querySelector('.custom-feedback-text');
    if (!text) {
      text = document.createElement('span');
      text.className = 'custom-feedback-text';
      Array.from(row.childNodes).forEach((node) => {
        if (node !== checkbox) node.remove();
      });
      row.appendChild(text);
    }
    text.textContent = value;

    let actions = row.querySelector('.custom-feedback-actions');
    if (!actions) {
      actions = document.createElement('span');
      actions.className = 'custom-feedback-actions';
      actions.append(
        createFeedbackActionButton('edit', 'Edit feedback option', null, 'builtin', original),
        createFeedbackActionButton('delete', 'Delete feedback option', null, 'builtin', original)
      );
      row.appendChild(actions);
    }
  });
}

function addCustomFeedbackItem() {
  const value = elements.newFeedbackItem.value.trim();
  if (!value) {
    showToast('Enter a feedback option first');
    elements.newFeedbackItem.focus();
    return;
  }

  const matchingIndex = appSettings.customFeedbackItems.findIndex(
    (item, index) => index !== editingFeedbackIndex && item.toLowerCase() === value.toLowerCase()
  );
  const matchesBuiltIn = Array.from(
    elements.feedbackChecklist.querySelectorAll('label.feedback-item input[type="checkbox"]')
  ).some((checkbox) => {
    const row = checkbox.closest('label');
    const isCurrentBuiltin = editingBuiltinFeedback &&
      row.dataset.originalFeedback === editingBuiltinFeedback;
    return !isCurrentBuiltin && checkbox.value.toLowerCase() === value.toLowerCase();
  });
  if (matchingIndex !== -1 || matchesBuiltIn) {
    showToast('That feedback option already exists');
    return;
  }

  const nextItems = [...appSettings.customFeedbackItems];
  const wasEditing = editingFeedbackIndex !== null;
  const wasEditingBuiltin = editingBuiltinFeedback !== null;
  const checkedItems = new Set(getCheckedFeedbackItems());
  if (wasEditingBuiltin) {
    const oldValue = appSettings.builtinFeedbackOverrides[editingBuiltinFeedback] || editingBuiltinFeedback;
    if (checkedItems.has(oldValue)) {
      checkedItems.delete(oldValue);
      checkedItems.add(value);
    }
    const nextOverrides = {
      ...appSettings.builtinFeedbackOverrides,
      [editingBuiltinFeedback]: value
    };
    saveBuiltinFeedbackItems(nextOverrides, appSettings.deletedBuiltinFeedback, () => {
      renderBuiltinFeedbackItems(checkedItems);
      cancelCustomFeedbackEdit();
      updateFeedbackPreview();
      showToast('Feedback option updated');
    });
    return;
  } else if (wasEditing) {
    const oldValue = nextItems[editingFeedbackIndex];
    if (checkedItems.has(oldValue)) {
      checkedItems.delete(oldValue);
      checkedItems.add(value);
    }
    nextItems[editingFeedbackIndex] = value;
  } else {
    nextItems.push(value);
  }

  saveCustomFeedbackItems(nextItems, () => {
    renderCustomFeedbackItems(checkedItems);
    if (!wasEditing) {
      const customCheckboxes = elements.feedbackChecklist.querySelectorAll(
        '[data-custom-feedback] input[type="checkbox"]'
      );
      customCheckboxes[customCheckboxes.length - 1].checked = true;
    }
    cancelCustomFeedbackEdit();
    elements.newFeedbackItem.value = '';
    updateFeedbackPreview();
    showToast(wasEditing ? 'Feedback option updated' : 'Feedback option saved');
  });
}

function createFeedbackActionButton(action, label, index, type = 'custom', original = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `feedback-option-action feedback-option-${action}`;
  button.dataset.feedbackAction = action;
  button.dataset.feedbackType = type;
  if (index !== null) button.dataset.feedbackIndex = String(index);
  if (original) button.dataset.originalFeedback = original;
  button.title = label;
  button.innerHTML = action === 'edit'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="m19 6-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path></svg>';
  button.setAttribute('aria-label', label);
  return button;
}

function startCustomFeedbackEdit(index) {
  if (!Number.isInteger(index) || !appSettings.customFeedbackItems[index]) return;
  editingFeedbackIndex = index;
  editingBuiltinFeedback = null;
  elements.newFeedbackItem.value = appSettings.customFeedbackItems[index];
  elements.btnAddFeedbackItem.textContent = 'Save Changes';
  elements.btnCancelFeedbackEdit.classList.remove('hidden');
  elements.newFeedbackItem.focus();
}

function cancelCustomFeedbackEdit() {
  editingFeedbackIndex = null;
  editingBuiltinFeedback = null;
  elements.newFeedbackItem.value = '';
  elements.btnAddFeedbackItem.textContent = '+ Add to Feedback Options';
  elements.btnCancelFeedbackEdit.classList.add('hidden');
}

function deleteCustomFeedbackItem(index) {
  if (!Number.isInteger(index) || !appSettings.customFeedbackItems[index]) return;
  const nextItems = appSettings.customFeedbackItems.filter((_, itemIndex) => itemIndex !== index);
  saveCustomFeedbackItems(nextItems, () => {
    if (editingFeedbackIndex === index) {
      cancelCustomFeedbackEdit();
    } else if (editingFeedbackIndex !== null && editingFeedbackIndex > index) {
      editingFeedbackIndex -= 1;
    }
    renderCustomFeedbackItems();
    updateFeedbackPreview();
    showToast('Feedback option deleted');
  });
}

function startBuiltinFeedbackEdit(original) {
  const value = appSettings.builtinFeedbackOverrides[original] || original;
  if (!original || appSettings.deletedBuiltinFeedback.includes(original)) return;
  editingFeedbackIndex = null;
  editingBuiltinFeedback = original;
  elements.newFeedbackItem.value = value;
  elements.btnAddFeedbackItem.textContent = 'Save Changes';
  elements.btnCancelFeedbackEdit.classList.remove('hidden');
  elements.newFeedbackItem.focus();
}

function deleteBuiltinFeedbackItem(original) {
  if (!original || appSettings.deletedBuiltinFeedback.includes(original)) return;
  const deletedItems = [...appSettings.deletedBuiltinFeedback, original];
  const checkedItems = new Set(getCheckedFeedbackItems());
  const currentValue = appSettings.builtinFeedbackOverrides[original] || original;
  checkedItems.delete(currentValue);

  saveBuiltinFeedbackItems(appSettings.builtinFeedbackOverrides, deletedItems, () => {
    if (editingBuiltinFeedback === original) cancelCustomFeedbackEdit();
    renderBuiltinFeedbackItems(checkedItems);
    updateFeedbackPreview();
    showToast('Feedback option deleted');
  });
}

function saveBuiltinFeedbackItems(overrides, deletedItems, onSaved) {
  chrome.storage.local.set({
    builtinFeedbackOverrides: overrides,
    deletedBuiltinFeedback: deletedItems
  }, () => {
    if (chrome.runtime.lastError) {
      showToast('Could not save feedback options');
      console.error('Saving built-in feedback failed:', chrome.runtime.lastError.message);
      return;
    }

    appSettings.builtinFeedbackOverrides = overrides;
    appSettings.deletedBuiltinFeedback = deletedItems;
    onSaved();
  });
}

function saveCustomFeedbackItems(items, onSaved) {
  chrome.storage.local.set({ customFeedbackItems: items }, () => {
    if (chrome.runtime.lastError) {
      showToast('Could not save feedback options');
      console.error('Saving custom feedback failed:', chrome.runtime.lastError.message);
      return;
    }

    appSettings.customFeedbackItems = items;
    onSaved();
  });
}
