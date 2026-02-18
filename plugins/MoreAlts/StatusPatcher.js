import { storage } from "@vendetta/plugin";
import { React, ReactNative } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";
import { findByProps } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";

const bunny = typeof window !== 'undefined' ? window.bunny : undefined;
let metro = bunny?.metro;
if (!metro) {
  try {
    // fallback to require if available
    // eslint-disable-next-line no-undef
    metro = require("@vendetta/metro");
  } catch (e) {
    metro = null;
  }
}
const findByNameLazyMetro = metro?.findByNameLazy || metro?.findByName || null;
const findByPropsLazyMetro = metro?.findByPropsLazy || metro?.findByProps || null;

function buildQuickSwitchUI(React, ReactNative, accounts, onSwitch) {
  const { View, Text, TouchableOpacity, Image } = ReactNative;

  const items = (accounts || []).slice(0, 6).map((acc, idx) => {
    const avatarUrl = acc.avatar
      ? `https://cdn.discordapp.com/avatars/${acc.id}/${acc.avatar}.png?size=48`
      : `https://cdn.discordapp.com/embed/avatars/1.png`;

    return React.createElement(View, {
      key: acc.id,
      style: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 8,
        marginBottom: 6,
        backgroundColor: "#2f3136",
        borderRadius: 8,
      },
    }, [
      React.createElement(TouchableOpacity, {
        key: "avatar",
        onPress: () => onSwitch(acc.id),
        style: { marginRight: 10 },
      }, React.createElement(Image, {
        source: { uri: avatarUrl },
        style: { width: 36, height: 36, borderRadius: 18 },
      })),

      React.createElement(View, { key: "info", style: { flex: 1 } }, [
        React.createElement(Text, { key: "name", style: { color: "white", fontSize: 14, fontWeight: "bold" } }, `${idx + 1}. ${acc.username}`),
        React.createElement(Text, { key: "sub", style: { color: "#b9bbbe", fontSize: 12, marginTop: 2 } }, "Tap to switch"),
      ])
    ]);
  });

  return React.createElement(View, { style: { marginTop: 12, paddingHorizontal: 8 } }, [
    React.createElement(Text, { key: "title", style: { color: "#b9bbbe", fontWeight: "700", marginBottom: 8 } }, "Quick Switch"),
    ...items
  ]);
}

export default function patchStatus() {
  const patches = [];
  try {
    const candidateNames = [
      "CustomStatusModal",
      "CustomStatusEditor",
      "EditCustomStatus",
      "CustomStatus",
      "SetCustomStatus",
      "UserCustomStatusModal",
      "SetCustomStatusModal",
      "UserStatusSettings",
      "StatusPicker",
      "PresenceModal",
      "PresencePicker",
      "EditPresence",
      "UserPresenceSettings",
    ];

    const switcher = findByProps("switchAccountToken") || (findByPropsLazyMetro && findByPropsLazyMetro("switchAccountToken"));

    for (const name of candidateNames) {
      const Comp = (findByNameLazyMetro && typeof findByNameLazyMetro === 'function') ? findByNameLazyMetro(name, false) : null;
      if (!Comp) continue;

      patches.push(
        after("render", Comp, (args, res) => {
          try {
            const host = findInReactTree(res, n => Array.isArray(n?.props?.children) && n.props.children.length > 0) || findInReactTree(res, n => n?.props && n.props.children);
            const accounts = (storage.accountOrder || []).filter(id => storage.accounts[id]).map(id => storage.accounts[id]);

            if (!accounts.length || !host) return res;

            const quickSwitchElement = buildQuickSwitchUI(React, ReactNative, accounts, async (accountId) => {
              try {
                const account = storage.accounts[accountId];
                if (!account) return showToast("Account not found", 1);
                showToast(`Switching to ${account.username}...`, 0);
                if (!switcher || !switcher.switchAccountToken) {
                  showToast("Account switching not available", 1);
                  return;
                }
                await switcher.switchAccountToken(account.token);
                showToast(`Switched to ${account.username}!`, 0);
              } catch (e) {
                console.error("Quick switch failed:", e);
                showToast("Failed to switch account", 1);
              }
            });

            // avoid double-injection
            const existing = React.Children.toArray(host.props.children).find(c => c && c.key === "quick-switch-root");
            if (!existing) {
              const merged = [...React.Children.toArray(host.props.children), React.cloneElement(quickSwitchElement, { key: "quick-switch-root" })];
              try {
                host.props.children = merged;
              } catch (e) {
                // fallback: attempt direct push if assignment not allowed
                try { host.props.children.push(React.cloneElement(quickSwitchElement, { key: "quick-switch-root" })); } catch {}
              }
            }

          } catch (e) {
            console.error("Status render patch error:", e);
          }

          return res;
        })
      );

      break;
    }
  } catch (e) {
    console.error("patchStatus error:", e);
  }

  return () => patches.forEach(un => un && un());
}
