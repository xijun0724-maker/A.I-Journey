/**
 * Settings and AI test action handlers
 */

import { Store } from "../store.js";
import { UI } from "../scope.js";
import { CFG } from "../../config/constants.js";
import { readSettingsForm } from "../../config/settings.js";
import { q, toast } from "../../utils/dom.js";
import * as AI from "../../ai/index.js";
import {
  setApiKey,
  clearApiKey,
  getApiKey,
  hydrateKey,
} from "../../utils/secure.js";

/**
 * Set the OpenRouter model — the only decision the model selector makes now
 * that there is exactly one endpoint.
 * @param {string} model - Model id from CFG.openrouter.freeModels (or any
 *   other OpenRouter id); blank keeps the current one.
 */
export function applyModel(model) {
  const s = Store.settings.get();
  const targetModel = model || s.model || CFG.openrouter.model;
  return Store.settings.update({ model: targetModel });
}

export function saveSettings() {
  const s = Store.settings.get();
  const keyInput = q("#setKey");
  const typedKey = keyInput && keyInput.value.trim();

  /* The schema maps every present form control to a typed value in one pass;
     apiKey is pulled back out because it belongs in sessionStorage, never in
     the form value. Model comes straight from #setModel — there is no
     provider branch left to special-case it against. */
  const patch = readSettingsForm(null, s);
  delete patch.apiKey;

  if (typedKey) {
    patch.apiKey = typedKey;
    setApiKey(typedKey);
  } else {
    const savedKey = getApiKey();
    if (savedKey) {
      patch.apiKey = savedKey;
    } else {
      patch.apiKey = "";
      clearApiKey();
    }
  }

  const updated = Store.settings.update(patch);
  hydrateKey(updated);
  UI.toastSaved("Settings saved.");
}

/**
 * Save the settings form, then probe the configured provider.
 * saveSettings() is synchronous — it must not be chained as a promise.
 * Always resolves, so a failed probe never leaves the UI stuck on "Testing".
 */
export async function testAI() {
  const msg = q("#aiTestMsg");
  if (msg) msg.textContent = "Testing...";
  try {
    saveSettings();
    const result = await AI.test();
    const ok = !!(result && result.ok);
    const detail = (result && result.message) || "Connection failed.";
    if (msg) msg.textContent = detail;
    toast(ok ? "AI connected." : detail, ok ? "ok" : "bad");
    return result;
  } catch (e) {
    const detail = (e && e.message) || "Connection failed.";
    if (msg) msg.textContent = detail;
    toast(detail, "bad");
    return { ok: false, message: detail };
  }
}

export function clearApiKeyFn() {
  clearApiKey();
  Store.settings.update({ apiKey: "" });
  toast("API key cleared.", "ok");
}
