// QA script: stubs chrome APIs, loads popup.html, asserts the two requested behaviors.
export default async function run(page, ui) {
  // Stub chrome.* APIs before popup.js runs.
  await page.addInitScript(() => {
    window.chrome = {
      storage: {
        local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() },
      },
      tabs: {
        query: async () => [{ id: 1, url: "https://example.com/manual" }],
        sendMessage: (id, msg, cb) => cb && cb(undefined),
      },
      scripting: { executeScript: async () => {} },
      runtime: { lastError: { message: "stub" } },
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

  return results;
}
