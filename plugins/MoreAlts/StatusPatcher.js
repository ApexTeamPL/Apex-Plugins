import { storage } from "@vendetta/plugin";
import { React, ReactNative } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";
import { findByProps } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";

const bunny = window.bunny;

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
    ];

    const switcher = findByProps("switchAccountToken");

    for (const name of candidateNames) {
      const Comp = bunny?.metro?.findByNameLazy?.(name, false);
      if (!Comp) continue;

      patches.push(
        after("render", Comp, (args, res) => {
          try {
            const target = findInReactTree(res, (n) => {
              try {
                if (!n || !n.props) return false;
                const c = n.props.children;
                if (typeof c === "string") {
                  return c.toLowerCase().includes("set custom") || c.toLowerCase().includes("custom status");
                }
                if (Array.isArray(c)) {
                  return c.some((ch) => typeof ch === "string" && (ch.toLowerCase().includes("set custom") || ch.toLowerCase().includes("custom status")));
                }
                return false;
              } catch { return false; }
            });

            if (!target) return res;

            const container = target._owner?.stateNode || target.props || target;

            const host = findInReactTree(res, n => Array.isArray(n?.props?.children) && n.props.children.length > 0);
            const accounts = (storage.accountOrder || []).filter(id => storage.accounts[id]).map(id => storage.accounts[id]);

            if (!accounts.length) return res;

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

            if (target.props && Array.isArray(target.props.children)) {
              target.props.children.push(quickSwitchElement);
            } else if (host && host.props && Array.isArray(host.props.children)) {
              const idx = host.props.children.findIndex(c => c === target || (c && c.key === target.key));
              if (idx >= 0) host.props.children.splice(idx + 1, 0, quickSwitchElement);
              else host.props.children.push(quickSwitchElement);
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
