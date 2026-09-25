import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { Forms, Button } from "@vendetta/ui/components";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { isServerExcluded, isDMExcluded } from "./Settings";

const { View, Pressable, StyleSheet, Image } = RN;
const Haptic = findByProps("triggerHapticFeedback", "HapticFeedbackTypes");

const TILE = 48;
const MARGIN = 4;
const ALERT_KEY = "read_all_options_alert";

const getStores = () => ({
  GuildStore: findByStoreName("GuildStore"),
  GuildChannelStore: findByStoreName("GuildChannelStore") || findByStoreName("ChannelStore"),
  ChannelStore: findByStoreName("ChannelStore"),
  ReadStateStore: findByStoreName("ReadStateStore"),
  FluxDispatcher: findByProps("dispatch", "subscribe") || findByStoreName("Dispatcher")
});

const getDMChannels = (ChannelStore: any, GuildChannelStore: any) => {
  const dmChannels: any[] = [];
  const channelStore = ChannelStore || GuildChannelStore;
  if (!channelStore) return dmChannels;

  if (channelStore.getPrivateChannels) {
    try {
      const privateChannels = channelStore.getPrivateChannels();
      if (privateChannels && typeof privateChannels === "object") {
        Object.values(privateChannels).forEach((channel: any) => {
          if (channel && channel.id) dmChannels.push(channel);
        });
      }
    } catch {}
  }
  return dmChannels;
};

const getUnreadChannels = (mode: "all" | "servers" | "dms") => {
  const { GuildStore, GuildChannelStore, ChannelStore, ReadStateStore } = getStores();
  if (!ReadStateStore) return [];

  const channels: Array<any> = [];

  if ((mode === "all" || mode === "servers") && GuildStore) {
    const guilds = GuildStore.getGuilds();
    Object.values(guilds).forEach((guild: any) => {
      if (!guild?.id || isServerExcluded(guild.id)) return;
      try {
        let guildChannels: any[] = [];
        const channelStore = GuildChannelStore || ChannelStore;
        if (channelStore?.getChannels) {
          const channelData = channelStore.getChannels(guild.id);
          if (channelData?.SELECTABLE) guildChannels = guildChannels.concat(channelData.SELECTABLE);
          if (channelData?.VOCAL) guildChannels = guildChannels.concat(channelData.VOCAL);
        }

        guildChannels.forEach((c: any) => {
          const channel = c?.channel || c;
          if (!channel?.id) return;
          if (ReadStateStore.hasUnread?.(channel.id)) {
            channels.push({
              channelId: channel.id,
              messageId: ReadStateStore.lastMessageId?.(channel.id) || null,
              readStateType: 0
            });
          }
        });
      } catch {}
    });
  }

  if (mode === "all" || mode === "dms") {
    const dmChannels = getDMChannels(ChannelStore, GuildChannelStore);
    dmChannels.forEach((channel: any) => {
      if (!channel?.id || isDMExcluded(channel.id)) return;
      if (ReadStateStore.hasUnread?.(channel.id)) {
        channels.push({
          channelId: channel.id,
          messageId: ReadStateStore.lastMessageId?.(channel.id) || null,
          readStateType: 0
        });
      }
    });
  }

  return channels;
};

const executeClear = (mode: "all" | "servers" | "dms") => {
  const { FluxDispatcher } = getStores();
  const targetChannels = getUnreadChannels(mode);

  if (targetChannels.length === 0) {
    showToast("No unread notifications!", getAssetIDByName("Small"));
    return;
  }

  FluxDispatcher.dispatch({
    type: "BULK_ACK",
    context: "APP",
    channels: targetChannels
  });

  const label = mode === "all" ? "notifications" : mode === "servers" ? "server channels" : "DMs";
  showToast(`Cleared ${targetChannels.length} ${label}!`, getAssetIDByName("Check"));
};

export default function ReadButton() {
  const handlePress = () => {
    Haptic?.triggerHapticFeedback?.(Haptic.HapticFeedbackTypes.SOFT);

    const bunny = (globalThis as any).bunny;
    const openAlert = bunny?.ui?.alerts?.openAlert;
    const dismissAlert = bunny?.ui?.alerts?.dismissAlert;
    const AlertModal = bunny?.ui?.components?.wrappers?.AlertModal;

    if (!openAlert || !AlertModal) {
      executeClear("all");
      return;
    }

    openAlert(
      ALERT_KEY,
      React.createElement(AlertModal, {
        title: "👁️ Read All Options",
        content: "Choose what you want to mark as read:",
        actions: React.createElement(
          View,
          { style: { gap: 8, width: "100%", paddingTop: 8 } },
          React.createElement(Button, {
            text: "Mark All Read",
            color: "brand",
            size: "small",
            onPress: () => {
              dismissAlert(ALERT_KEY);
              executeClear("all");
            }
          }),
          React.createElement(Button, {
            text: "Servers Only",
            color: "grey",
            size: "small",
            onPress: () => {
              dismissAlert(ALERT_KEY);
              executeClear("servers");
            }
          }),
          React.createElement(Button, {
            text: "DMs Only",
            color: "grey",
            size: "small",
            onPress: () => {
              dismissAlert(ALERT_KEY);
              executeClear("dms");
            }
          }),
          React.createElement(Button, {
            text: "Cancel",
            color: "red",
            size: "small",
            onPress: () => dismissAlert(ALERT_KEY)
          })
        )
      })
    );
  };

  return (
    <View style={st.row}>
      <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel="Read All Options">
        <View style={st.tile}>
          <View style={st.circleBg}>
            <Image
              source={getAssetIDByName("ic_eye")}
              style={{ width: 24, height: 24, tintColor: "#DBDEE1" }}
            />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  row: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingTop: MARGIN,
    paddingBottom: MARGIN,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 16,
    backgroundColor: "#111214",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  circleBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2B2D31",
    alignItems: "center",
    justifyContent: "center",
  }
});
