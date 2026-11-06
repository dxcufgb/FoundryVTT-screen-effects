/**
 * Dxcufgb's screen effects - optional integration with Dxcufgb's Debug Recorder (dxcufgbs-debug-recorder).
 *
 * Not a dependency: without the recorder installed every function here does nothing, and nothing here may ever
 * throw into the module.
 *   registerDebugRecorder(snapshot)  hands the recorder a snapshot() of this module's runtime state, once,
 *                                    whichever loads first (the recorder's ready hook, or this module's init/ready
 *                                    when the recorder's API already exists)
 *   crumb(key, data)                 a breadcrumb ("area.action", small flat data) while the recorder is recording
 *
 * Snapshot and breadcrumb data must never contain names, free text, image paths or URLs: only counts, booleans,
 * numbers, document types and this module's own fixed ids (effect ids, status ids).
 *
 * MODULE_ID comes from main.js, which imports this file: the import is circular, but MODULE_ID is only read when a
 * function here runs, after main.js has been evaluated.
 */

import { MODULE_ID } from "./main.js";

const RECORDER_ID = "dxcufgbs-debug-recorder";

let recorderApi = null;
let snapshotFn = null;
let registered = false;

/** The recorder's API, or null when it isn't installed (or reading it fails). */
function recorder() {
  try {
    return recorderApi ?? globalThis.game?.modules?.get?.(RECORDER_ID)?.api ?? null;
  } catch {
    return null;
  }
}

/** The snapshot handed to the recorder: never throws, returns {snapshotFailed: true} when building it fails. */
function safeSnapshot() {
  try {
    return snapshotFn ? snapshotFn() : {};
  } catch (err) {
    console.warn(`${MODULE_ID} | debug recorder snapshot failed`, err);
    return { snapshotFailed: true };
  }
}

/** Registers with the recorder when both it and the snapshot are there, once. */
function tryRegister() {
  if (registered || !snapshotFn) return;
  try {
    const rec = recorder();
    if (typeof rec?.register !== "function") return;
    rec.register(MODULE_ID, { snapshot: safeSnapshot });
    registered = true;
  } catch (err) {
    console.warn(`${MODULE_ID} | could not register with the debug recorder`, err);
  }
}

Hooks.once(`${RECORDER_ID}.ready`, rec => {
  recorderApi = rec ?? null;
  tryRegister();
});

/** Registers this module's snapshot with the recorder (safe to call more than once; registers only once). */
export function registerDebugRecorder(snapshot) {
  if (typeof snapshot === "function") snapshotFn = snapshot;
  tryRegister();
}

/** A breadcrumb while the recorder is recording; otherwise nothing. */
export function crumb(key, data) {
  try {
    const rec = recorder();
    if (!rec?.isRecording?.()) return;
    rec.breadcrumb(MODULE_ID, key, data);
  } catch {
    // a recorder problem must never break the module
  }
}
