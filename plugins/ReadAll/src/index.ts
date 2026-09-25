import { after } from "@vendetta/patcher";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import ReadButton from "./ReadButton";
import Settings from "./Settings";

const { View } = RN;

const TAG = "[ReadAll+]";
const TILE = 48;
const MARGIN = 4;

let unpatchers: (() => boolean)[] = [];
const patchedObjects = new WeakSet<object>();
let retryTimer: ReturnType<typeof setInterval> | undefined;

function isUseGuildsBarProps(exports: any): boolean {
  return (
    typeof exports?.default === "function" &&
    exports.default.name === "useGuildsBarProps"
  );
}

function patchFooter(ret: any) {
  const ldp = ret?.listDataProps;
  if (!ldp || patchedObjects.has(ldp)) return;
  if (typeof ldp.footerSize !== "function" || typeof ldp.renderFooter !== "function") return;

  const origFooterSize = ldp.footerSize;
  const origRenderFooter = ldp.renderFooter;
  const extra = TILE + 2 * MARGIN;

  ldp.footerSize = () => origFooterSize.call(ldp) + extra;
  ldp.renderFooter = () =>
    React.createElement(
      View,
      { style: { alignSelf: "stretch" }, collapsable: false },
      origRenderFooter.call(ldp),
      React.createElement(ReadButton)
    );

  patchedObjects.add(ldp);
}

function scanRegistry(): number {
  const modules = (globalThis as any)?.modules;
  if (!modules) return 0;

  let patchedCount = 0;
  for (const id in modules) {
    const def = modules[id];
    if (!def?.isInitialized) continue;
    const exports = def.publicModule?.exports;
    if (!exports) continue;

    if (isUseGuildsBarProps(exports)) {
      try {
        unpatchers.push(
          after("default", exports, (_args: any[], ret: any) => patchFooter(ret))
        );
        patchedCount++;
      } catch (e) {
        console.log(TAG, `Failed to patch module ${id}:`, e);
      }
    }
  }
  return patchedCount;
}

export default {
  onLoad() {
    const count = scanRegistry();
    if (count === 0) {
      let ticks = 0;
      retryTimer = setInterval(() => {
        ticks++;
        const n = scanRegistry();
        if (n > 0 || ticks >= 30) {
          if (retryTimer) clearInterval(retryTimer);
          retryTimer = undefined;
        }
      }, 1000);
    }
  },

  onUnload() {
    if (retryTimer) clearInterval(retryTimer);
    retryTimer = undefined;
    unpatchers.forEach((u) => u());
    unpatchers = [];
  },

  settings: Settings
};