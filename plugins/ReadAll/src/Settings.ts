import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";

const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableRow, Stack, TextInput } = findByProps(
  "TableSwitchRow",
  "TableCheckboxRow",
  "TableRowGroup",
  "Stack",
  "TableRow"
);

storage.excludedServers ??= [];
storage.excludedDMs ??= [];

export const isServerExcluded = (serverId: string): boolean =>
  storage.excludedServers?.includes(serverId);

export const isDMExcluded = (channelId: string): boolean =>
  storage.excludedDMs?.includes(channelId);

export default function Settings() {
  useProxy(storage);
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const [newServerId, setNewServerId] = React.useState("");
  const [newDMId, setNewDMId] = React.useState("");

  const getServerName = (serverId: string): string => {
    try {
      const guild = findByStoreName("GuildStore")?.getGuild?.(serverId);
      return guild?.name ? `${guild.name} (${serverId})` : serverId;
    } catch {
      return serverId;
    }
  };

  const getDMName = (channelId: string): string => {
    try {
      const channel = findByStoreName("ChannelStore")?.getChannel?.(channelId);
      if (channel?.name) return `${channel.name} (${channelId})`;
      if (channel?.recipients?.[0]) {
        const user = findByStoreName("UserStore")?.getUser?.(channel.recipients[0]);
        return user?.username ? `@${user.username} (${channelId})` : channelId;
      }
      return channelId;
    } catch {
      return channelId;
    }
  };

  const addServerId = () => {
    if (!newServerId.trim()) {
      showToast("Please enter a server ID", getAssetIDByName("Small"));
      return;
    }
    const id = newServerId.trim();
    if (!storage.excludedServers.includes(id)) {
      storage.excludedServers = [...storage.excludedServers, id];
      setNewServerId("");
      forceUpdate();
      showToast("Server excluded", getAssetIDByName("Check"));
    } else {
      showToast("Server already excluded", getAssetIDByName("Warning"));
    }
  };

  const removeServerId = (id: string) => {
    storage.excludedServers = storage.excludedServers.filter((sId: string) => sId !== id);
    forceUpdate();
    showToast("Server removed", getAssetIDByName("Check"));
  };

  const addDMId = () => {
    if (!newDMId.trim()) {
      showToast("Please enter a channel ID", getAssetIDByName("Small"));
      return;
    }
    const id = newDMId.trim();
    if (!storage.excludedDMs.includes(id)) {
      storage.excludedDMs = [...storage.excludedDMs, id];
      setNewDMId("");
      forceUpdate();
      showToast("DM excluded", getAssetIDByName("Check"));
    } else {
      showToast("DM already excluded", getAssetIDByName("Warning"));
    }
  };

  const removeDMId = (id: string) => {
    storage.excludedDMs = storage.excludedDMs.filter((dId: string) => dId !== id);
    forceUpdate();
    showToast("DM removed", getAssetIDByName("Check"));
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
      <Stack spacing={8}>
        <TableRowGroup title="Read All+ Info">
          <TableRow
            label="What is this?"
            subLabel="Mark all unread servers and DMs as read with one click, excluding listed IDs"
          />
        </TableRowGroup>

        {/* SERVER EXCEPTIONS */}
        <TableRowGroup title="Exclude Server">
          <Stack spacing={4}>
            <TextInput
              placeholder="Enter Server ID"
              value={newServerId}
              onChange={setNewServerId}
              isClearable
              onSubmitEditing={addServerId}
              returnKeyType="done"
            />
          </Stack>
        </TableRowGroup>

        <TableRowGroup>
          <TableRow
            label="Add Server Exception"
            subLabel="Prevent this server from being marked as read"
            trailing={<TableRow.Arrow />}
            onPress={addServerId}
          />
        </TableRowGroup>

        {storage.excludedServers && storage.excludedServers.length > 0 && (
          <TableRowGroup title="Excluded Servers">
            {storage.excludedServers.map((serverId: string, index: number) => (
              <TableRow
                key={index}
                label={getServerName(serverId)}
                trailing={
                  <RN.TouchableOpacity onPress={() => removeServerId(serverId)}>
                    <RN.Image
                      source={getAssetIDByName("TrashIcon")}
                      style={{ width: 20, height: 20, tintColor: "#ff4d4d" }}
                    />
                  </RN.TouchableOpacity>
                }
              />
            ))}
          </TableRowGroup>
        )}

        {/* DM EXCEPTIONS */}
        <TableRowGroup title="Exclude DM / Group">
          <Stack spacing={4}>
            <TextInput
              placeholder="Enter Channel ID"
              value={newDMId}
              onChange={setNewDMId}
              isClearable
              onSubmitEditing={addDMId}
              returnKeyType="done"
            />
          </Stack>
        </TableRowGroup>

        <TableRowGroup>
          <TableRow
            label="Add DM Exception"
            subLabel="Prevent this channel from being marked as read"
            trailing={<TableRow.Arrow />}
            onPress={addDMId}
          />
        </TableRowGroup>

        {storage.excludedDMs && storage.excludedDMs.length > 0 && (
          <TableRowGroup title="Excluded DMs">
            {storage.excludedDMs.map((channelId: string, index: number) => (
              <TableRow
                key={index}
                label={getDMName(channelId)}
                trailing={
                  <RN.TouchableOpacity onPress={() => removeDMId(channelId)}>
                    <RN.Image
                      source={getAssetIDByName("TrashIcon")}
                      style={{ width: 20, height: 20, tintColor: "#ff4d4d" }}
                    />
                  </RN.TouchableOpacity>
                }
              />
            ))}
          </TableRowGroup>
        )}
      </Stack>
    </ScrollView>
  );
}