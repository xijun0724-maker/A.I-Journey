/**
 * Course Image & Banner Customizer Modal
 * Generates aesthetic vector covers dynamically based on course titles,
 * or allows students to upload their own images.
 */

import { Store } from "../../core/store.js";
import { UI } from "../../core/state.js";
import { Router } from "../../core/router.js";
import { esc, safeCssUrl } from "../../utils/helpers.js";
import { q, toast } from "../../utils/dom.js";
import { modal } from "../../utils/feedback.js";
import { generateCourseCover, getCourseBanner } from "../../config/templates.js";

export function courseImageModal(courseId) {
  const c = courseId ? Store.course(courseId) : null;
  if (!c) {
    toast("Course not found.", "bad");
    return;
  }

  const hasValidCustomImage = Boolean(
    c.image && (
      c.image.startsWith("data:") ||
      c.image.startsWith("http://") ||
      c.image.startsWith("https://") ||
      c.image.startsWith("/")
    ),
  );
  let currentBanner = safeCssUrl(hasValidCustomImage ? c.image : getCourseBanner(c));
  let selectedValue = hasValidCustomImage ? c.image : currentBanner;
  let currentSeed = Math.floor(Math.random() * 10000);

  const body = `
    <div class="course-cover-modal-body">
      <!-- Live Card Preview -->
      <div class="cover-live-preview-box mb">
        <div class="live-preview-label">Live Preview on Course Card</div>
        <div class="preview-lms-card">
          <div id="previewCoverImg" class="preview-cover-surface" data-style="background-image: url('${currentBanner}'); background-size: cover; background-position: center;"></div>
          <div class="preview-card-details">
            <div class="preview-card-title">${esc(c.code ? c.code + " — " + c.title : c.title)}</div>
            <div class="preview-card-term">${esc(c.yearLevel || "First Year")}${c.instructor ? " · " + esc(c.instructor) : ""}</div>
          </div>
        </div>
      </div>

      <!-- Mode Tabs -->
      <div class="cover-mode-tabs mb">
        <button type="button" class="btn sm tab-btn active" id="tabGenerate">✨ Generate Based on Title</button>
        <button type="button" class="btn sm tab-btn" id="tabCustom">📷 Upload / Image URL</button>
      </div>

      <!-- Section 1: Dynamic Generator based on Course Title -->
      <div id="paneGenerate" class="cover-pane active">
        <div class="cover-generator-form">
          <div class="fld mb-sm">
            <span>Course Title & Subject Prompt</span>
            <input type="text" id="genTitleInput" value="${esc(c.title)}" placeholder="e.g. 2D Digital Animation or Theories of Learning" />
            <span class="tiny muted">The AI banner engine analyzes your title keywords to compose custom vector artwork and harmonic colors.</span>
          </div>

          <div class="grid g2 mb-sm">
            <label class="fld">
              <span>Artistic Style</span>
              <select id="genStyleSelect">
                <option value="modern">🎨 Modern Vector & Badges</option>
                <option value="gradient">🌌 Atmospheric Gradient Mesh</option>
                <option value="blueprint">📐 Technical Blueprint Grid</option>
                <option value="editorial">🏛️ Swiss Typographic Editorial</option>
              </select>
            </label>

            <label class="fld">
              <span>Color Mood</span>
              <select id="genPaletteSelect">
                <option value="auto">✨ Auto (Intelligent Subject Match)</option>
                <option value="ocean">🌊 Ocean Breeze (Cyan & Azure)</option>
                <option value="sunset">🌅 Sunset Glow (Coral & Amber)</option>
                <option value="emerald">🌿 Emerald Forest (Sage & Gold)</option>
                <option value="cyber">🔮 Cyber Neon (Indigo & Purple)</option>
                <option value="slate">⬛ Minimal Slate (Charcoal & Monochrome)</option>
              </select>
            </label>
          </div>

          <div class="generator-actions-row mt-sm">
            <button type="button" class="btn primary" id="btnRunGenerate">
              Generate
            </button>
            <button type="button" class="btn" id="btnShuffleSeed">
              🎲 Shuffle Variation
            </button>
          </div>
        </div>
      </div>

      <!-- Section 2: Custom Upload & URL -->
      <div id="paneCustom"  class="cover-pane u-hidden">
        <div class="upload-dropzone mb" id="uploadDropzone">
          <input type="file" id="coverFileInput" accept="image/*" class="u-hidden" />
          <div class="dropzone-icon">📷</div>
          <div class="dropzone-text"><strong>Click to upload an image</strong> or drag and drop</div>
          <div class="tiny muted">PNG, JPG, WEBP, or SVG (recommended aspect ratio: ~2.5:1)</div>
          <button type="button" class="btn sm mt-xs" id="btnBrowseFile">Browse File</button>
        </div>

        <div class="fld">
          <span>Or paste an image web URL</span>
          <div  class="row u-gap-8">
            <input type="url" id="coverUrlInput" placeholder="https://example.com/banner.jpg" value="${c.image && c.image.startsWith("http") ? esc(c.image) : ""}" class="u-flex-1" />
            <button type="button" class="btn sm" id="btnApplyUrl">Preview URL</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const footer = `
    <button class="btn ghost danger" id="btnRemoveCover">Remove cover</button>
    <span class="spacer"></span>
    <button class="btn" data-close="1">Cancel</button>
    <button class="btn primary" id="btnSaveCover">Save Cover</button>
  `;

  return modal({
    title: "Customize Course Cover — " + (c.code || c.title),
    wide: true,
    body: body,
    footer: footer,
    onMount: function (m, closeFn) {
      const previewImg = q("#previewCoverImg", m);
      const tabGenerate = q("#tabGenerate", m);
      const tabCustom = q("#tabCustom", m);
      const paneGenerate = q("#paneGenerate", m);
      const paneCustom = q("#paneCustom", m);

      // Generator controls
      const genTitleInput = q("#genTitleInput", m);
      const genStyleSelect = q("#genStyleSelect", m);
      const genPaletteSelect = q("#genPaletteSelect", m);
      const btnRunGenerate = q("#btnRunGenerate", m);
      const btnShuffleSeed = q("#btnShuffleSeed", m);

      // Upload controls
      const fileInput = q("#coverFileInput", m);
      const btnBrowseFile = q("#btnBrowseFile", m);
      const uploadDropzone = q("#uploadDropzone", m);
      const urlInput = q("#coverUrlInput", m);
      const btnApplyUrl = q("#btnApplyUrl", m);

      // Actions
      const btnRemoveCover = q("#btnRemoveCover", m);
      const btnSaveCover = q("#btnSaveCover", m);

      function updatePreview(bgUrl) {
        if (!bgUrl) {
          currentBanner = safeCssUrl(getCourseBanner(Object.assign({}, c, { image: null })));
        } else {
          currentBanner = safeCssUrl(bgUrl);
        }
        previewImg.style.backgroundImage = currentBanner
          ? `url("${currentBanner}")`
          : "";
      }

      // Initial mount preview render
      updatePreview(selectedValue);

      function triggerGeneration() {
        const customTitle = (genTitleInput.value || c.title || "Course").trim();
        const style = genStyleSelect.value;
        const palette = genPaletteSelect.value;
        const newSvg = generateCourseCover({
          title: customTitle,
          code: c.code || "",
          style: style,
          palette: palette,
          seed: currentSeed,
        });
        selectedValue = newSvg;
        updatePreview(newSvg);
      }

      // Switch to Generate tab
      tabGenerate.addEventListener("click", () => {
        tabGenerate.classList.add("active");
        tabCustom.classList.remove("active");
        paneGenerate.style.display = "block";
        paneCustom.style.display = "none";
      });

      // Switch to Custom Upload tab
      tabCustom.addEventListener("click", () => {
        tabCustom.classList.add("active");
        tabGenerate.classList.remove("active");
        paneCustom.style.display = "block";
        paneGenerate.style.display = "none";
      });

      // Run generation
      btnRunGenerate.addEventListener("click", () => {
        triggerGeneration();
        toast("Generated cover for " + (genTitleInput.value || c.title) + "!", "ok");
      });

      genTitleInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          triggerGeneration();
        }
      });

      // Shuffle generation
      btnShuffleSeed.addEventListener("click", () => {
        currentSeed = Math.floor(Math.random() * 100000);
        triggerGeneration();
        toast("New variation generated!", "ok");
      });

      // Style & Palette select change triggers generation immediately
      genStyleSelect.addEventListener("change", triggerGeneration);
      genPaletteSelect.addEventListener("change", triggerGeneration);

      // File Browser Trigger
      btnBrowseFile.addEventListener("click", () => fileInput.click());
      uploadDropzone.addEventListener("click", (e) => {
        if (e.target !== btnBrowseFile) fileInput.click();
      });

      // Handle File Selection via FileReader
      fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
          toast("Please choose a valid image file.", "warn");
          return;
        }

        const reader = new FileReader();
        reader.onload = function (evt) {
          const dataUrl = evt.target.result;
          selectedValue = dataUrl;
          updatePreview(dataUrl);
          toast("Image loaded in preview.", "ok");
        };
        reader.readAsDataURL(file);
      });

      // Drag and drop support
      uploadDropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadDropzone.classList.add("drag-over");
      });
      uploadDropzone.addEventListener("dragleave", () => {
        uploadDropzone.classList.remove("drag-over");
      });
      uploadDropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadDropzone.classList.remove("drag-over");
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = function (evt) {
            const dataUrl = evt.target.result;
            selectedValue = dataUrl;
            updatePreview(dataUrl);
            toast("Image loaded in preview.", "ok");
          };
          reader.readAsDataURL(file);
        }
      });

      // Image URL preview
      btnApplyUrl.addEventListener("click", () => {
        const url = urlInput.value.trim();
        if (!url) {
          toast("Please enter an image URL.", "warn");
          return;
        }
        selectedValue = url;
        updatePreview(url);
        toast("URL preview applied.", "ok");
      });

      // Remove Cover
      btnRemoveCover.addEventListener("click", () => {
        selectedValue = "";
        updatePreview("");
        toast("Reverted to default title-generated banner.", "info");
      });

      // Save Cover
      btnSaveCover.addEventListener("click", () => {
        c.image = selectedValue || null;
        Store.saveNow();
        closeFn();
        Router.scheduleRender();
        UI.toastSaved("Course cover updated.");
      });
    },
  });
}
