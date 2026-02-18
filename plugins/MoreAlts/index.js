import * as common from "../../common";
import { semanticColors } from "@vendetta/ui";
import { registerCommand } from "@vendetta/commands";
import { findByStoreName, findByProps } from "@vendetta/metro";
import { findInReactTree } from "@vendetta/utils";
import { setString } from "@vendetta/metro/common/clipboard";
import { before as patchBefore } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";
import { encode as encodeTok, characters2 } from "../../common/numberBase64";
import { storage } from "@vendetta/plugin";
import { React } from "@vendetta/metro/common";
import AccountSwitcherSettings from "./Settings";
import patchSidebar from "./SidebarPatcher";
import patchStatus from "./StatusPatcher";

const {
	meta: { resolveSemanticColor },
} = findByProps("colors", "meta");
const ThemeStore = findByStoreName("ThemeStore");
const UserStore = findByStoreName("UserStore");

export const EMBED_COLOR = () =>
	parseInt(resolveSemanticColor(ThemeStore.theme, semanticColors.BACKGROUND_SECONDARY).slice(1), 16);

const authorMods = {
	author: {
		username: "AccountSwitcher",
		avatar: "command",
		avatarURL: common.AVATARS?.command || "https://cdn.discordapp.com/embed/avatars/0.png",
	},
};

// Initialize storage structure
if (!storage.accounts) storage.accounts = {};
if (!storage.accountOrder) storage.accountOrder = [];
if (!storage.settings) {
	storage.settings = {
		enableCLI: true,
		confirmBeforeDelete: true,
		enableUnsafeFeatures: false,
		addToSidebar: true // Now using the correct patchSettingsPin method
	};
} else {
	// Ensure all properties exist and migrate old settings
	if (storage.settings.enableUnsafeFeatures === undefined) {
		storage.settings.enableUnsafeFeatures = false;
	}
	if (storage.settings.enableCLI === undefined) {
		storage.settings.enableCLI = storage.settings.showAccountNames !== false;
	}
	if (storage.settings.confirmBeforeDelete === undefined) {
		storage.settings.confirmBeforeDelete = true;
	}
	if (storage.settings.addToSidebar === undefined) {
		storage.settings.addToSidebar = true; // Now using correct method
	}
	// Remove old setting
	if (storage.settings.showAccountNames !== undefined) {
		delete storage.settings.showAccountNames;
	}
}

let madeSendMessage;
function sendMessage() {
	if (window.sendMessage) return window.sendMessage?.(...arguments);
	if (!madeSendMessage) madeSendMessage = common.mSendMessage?.(vendetta);
	return madeSendMessage?.(...arguments);
}

// Helper functions
function formatAccountName(account) {
	if (!account || !account.username) return "Unknown Account";
	return account.username;
}

function findAccountByInput(input) {
	const accounts = storage.accounts || {};
	const accountOrder = storage.accountOrder || [];
	
	const index = parseInt(input);
	if (!isNaN(index) && index >= 1 && index <= accountOrder.length) {
		const accountId = accountOrder[index - 1];
		return accounts[accountId] ? [accountId, accounts[accountId]] : null;
	}
	
	return Object.entries(accounts).find(([id, account]) => 
		account.username.toLowerCase() === input.toLowerCase() ||
		formatAccountName(account).toLowerCase() === input.toLowerCase()
	);
}

function getAccountIndex(accountId) {
	const accountOrder = storage.accountOrder || [];
	const index = accountOrder.indexOf(accountId);
	return index >= 0 ? index + 1 : null;
}

function addAccountToOrder(accountId) {
	if (!storage.accountOrder) storage.accountOrder = [];
	if (!storage.accountOrder.includes(accountId)) {
		storage.accountOrder.push(accountId);
	}
}

function removeAccountFromOrder(accountId) {
	if (!storage.accountOrder) storage.accountOrder = [];
	const index = storage.accountOrder.indexOf(accountId);
	if (index > -1) {
		storage.accountOrder.splice(index, 1);
	}
}

export default {
	meta: vendetta.plugin,
	settings: AccountSwitcherSettings,
	patches: [],
	
	onUnload() {
		this.patches.forEach((up) => up());
		this.patches = [];
	},

	onLoad() {
		
		const sidebarUnpatch = patchSidebar();
		this.patches.push(sidebarUnpatch);

		try {
			const statusUnpatch = patchStatus();
			this.patches.push(statusUnpatch);
		} catch (e) {
			console.error("Status patch failed:", e);
		}

		// Context menu patch for copying tokens
		const optionLabel = "Copy Token";
		const contextMenuUnpatch = patchBefore("render", findByProps("ScrollView").View, (args) => {
			try {
				if (!storage.settings?.enableUnsafeFeatures) return;
				
				let a = findInReactTree(args, (r) => r.key === ".$UserProfileOverflow");
				if (!a || !a.props || a.props.sheetKey !== "UserProfileOverflow") return;
				
				const props = a.props.content.props;
				if (props.options.some((option) => option?.label === optionLabel)) return;
				
				const currentUserId = UserStore.getCurrentUser()?.id;
				const focusedUserId = Object.keys(a._owner.stateNode._keyChildMapping)
					.find((str) => a._owner.stateNode._keyChildMapping[str] && str.match(/(?<=\$UserProfile)\d+/))
					?.slice?.(".$UserProfile".length) || currentUserId;
				const token = findByProps("getToken").getToken();

				props.options.unshift({
					isDestructive: true,
					label: optionLabel,
					onPress: () => {
						try {
							showToast(focusedUserId === currentUserId ? `Copied your token` : `Copied token of ${props.header.title}`);
							setString(
								focusedUserId === currentUserId
									? token
									: [
											Buffer.from(focusedUserId).toString("base64").replaceAll("=",""),
											encodeTok?.(+Date.now() - 1293840000, true) || "dummy",
											common.generateRandomString?.(characters2, 27) || "dummy",
									  ].join(".")
							);
							props.hideActionSheet();
						} catch (e) {
							console.error(e);
							showToast("Failed to copy token", 1);
						}
					},
				});
			} catch (e) {
				console.error("Context menu patch error:", e);
			}
		});
		
		this.patches.push(contextMenuUnpatch);

		// Command implementations
		const commands = {
			async mainCommand(args, ctx) {
				try {
					const messageMods = {
						...authorMods,
						interaction: {
							name: "/accswitcher",
							user: UserStore.getCurrentUser(),
						},
					};

					sendMessage?.({
						loggingName: "AccSwitcher main message",
						channelId: ctx.channel.id,
						embeds: [{
							color: EMBED_COLOR(),
							type: "rich",
							title: "📱 Account Switcher",
							description: storage.settings.addToSidebar 
								? "Account Manager is available in your settings sidebar!\n\nQuick commands:\n• `/accswitcher login <#>` - Switch to account\n• `/accswitcher add` - Add current account\n• `/accswitcher list` - Show all accounts"
								: "Opening Account Manager...\n\nQuick commands:\n• `/accswitcher login <#>` - Switch to account\n• `/accswitcher add` - Add current account\n• `/accswitcher list` - Show all accounts",
							footer: { text: storage.settings.addToSidebar ? "Check your settings sidebar for Account Switcher" : "Check plugin settings for the Account Manager interface" }
						}],
					}, messageMods);
					
					showToast(storage.settings.addToSidebar ? "Check settings sidebar for Account Switcher" : "Check plugin settings to access Account Manager", 0);
				} catch (e) {
					console.error("Main command error:", e);
					showToast("Check plugin settings to access Account Manager", 1);
				}
			},

			async addAccount(args, ctx) {
				try {
					const messageMods = {
						...authorMods,
						interaction: {
							name: "/accswitcher add",
							user: UserStore.getCurrentUser(),
						},
					};

					const token = findByProps("getToken").getToken();
					const currentUser = UserStore.getCurrentUser();
					
					if (!currentUser) {
						sendMessage?.({
							loggingName: "Add account error message",
							channelId: ctx.channel.id,
							embeds: [{
								color: EMBED_COLOR(),
								type: "rich",
								title: `❌ Failed to Get Current User`,
								description: "Could not retrieve current user information."
							}]
						}, messageMods);
						return;
					}

					if (storage.accounts[currentUser.id]) {
						const index = getAccountIndex(currentUser.id);
						sendMessage?.({
							loggingName: "Add account warning message",
							channelId: ctx.channel.id,
							embeds: [{
								color: EMBED_COLOR(),
								type: "rich",
								title: `⚠️ Account Already Saved`,
								description: `Your current account **${index}. ${currentUser.username}** is already saved.`
							}]
						}, messageMods);
						return;
					}

					const newAccount = {
						id: currentUser.id,
						username: currentUser.username,
						discriminator: currentUser.discriminator,
						avatar: currentUser.avatar,
						displayName: currentUser.globalName || currentUser.username,
						token: token,
						addedAt: Date.now()
					};
					
					storage.accounts[currentUser.id] = newAccount;
					addAccountToOrder(currentUser.id);

					const index = getAccountIndex(currentUser.id);
					sendMessage?.({
						loggingName: "Add account success message",
						channelId: ctx.channel.id,
						embeds: [{
							color: EMBED_COLOR(),
							type: "rich",
							title: `✅ Account Added Successfully`,
							description: `**${index}. ${currentUser.username}** has been saved.`,
							footer: { text: `Total accounts: ${Object.keys(storage.accounts).length}` }
						}]
					}, messageMods);

				} catch (e) {
					console.error("Add account error:", e);
					showToast("Failed to add account", 1);
				}
			},

			async login(args, ctx) {
				try {
					const messageMods = {
						...authorMods,
						interaction: {
							name: "/accswitcher login",
							user: UserStore.getCurrentUser(),
						},
					};

					const options = new Map(args.map((a) => [a.name, a]));
					const accountInput = options.get("account")?.value;

					if (!accountInput) {
						sendMessage?.({
							loggingName: "Login error message",
							channelId: ctx.channel.id,
							embeds: [{
								color: EMBED_COLOR(),
								type: "rich",
								title: `❌ No Account Specified`,
								description: "Please specify an account number, username, or ID."
							}]
						}, messageMods);
						return;
					}

					const found = findAccountByInput(accountInput);
					if (!found) {
						const availableAccounts = (storage.accountOrder || [])
							.filter(id => storage.accounts[id])
							.map((id, index) => `${index + 1}. ${formatAccountName(storage.accounts[id])}`)
							.join("\n");

						sendMessage?.({
							loggingName: "Login error message",
							channelId: ctx.channel.id,
							embeds: [{
								color: EMBED_COLOR(),
								type: "rich",
								title: `❌ Account Not Found`,
								description: `Could not find account "${accountInput}".${availableAccounts ? `\n\n**Available accounts:**\n${availableAccounts}` : '\n\nNo accounts saved yet. Use `/accswitcher add` first.'}`
							}]
						}, messageMods);
						return;
					}

					const [accountId, account] = found;
					const index = getAccountIndex(accountId);

					sendMessage?.({
						loggingName: "Login process message",
						channelId: ctx.channel.id,
						embeds: [{
							color: EMBED_COLOR(),
							type: "rich",
							title: `🔄 Switching to ${index}. ${formatAccountName(account)}...`
						}]
					}, messageMods);

					try {
						await findByProps("login", "logout", "switchAccountToken").switchAccountToken(account.token);
						showToast(`Switched to ${index}. ${formatAccountName(account)}!`, 0);
					} catch (switchError) {
						console.error("Switch error:", switchError);
						sendMessage?.({
							loggingName: "Login failure message",
							channelId: ctx.channel.id,
							embeds: [{
								color: EMBED_COLOR(),
								type: "rich",
								title: `❌ Failed to switch accounts`,
								description: `Error: ${switchError.message}`
							}]
						}, messageMods);
					}

				} catch (e) {
					console.error("Login command error:", e);
					showToast("Failed to execute login command", 1);
				}
			},

			listAccounts(args, ctx) {
				try {
					const messageMods = {
						...authorMods,
						interaction: {
							name: "/accswitcher list",
							user: UserStore.getCurrentUser(),
						},
					};

					const accounts = storage.accounts || {};
					const accountCount = Object.keys(accounts).length;

					if (accountCount === 0) {
						sendMessage?.({
							loggingName: "List accounts empty message",
							channelId: ctx.channel.id,
							embeds: [{
								color: EMBED_COLOR(),
								type: "rich",
								title: "📝 No Saved Accounts",
								description: "Use `/accswitcher add` to save your current account."
							}]
						}, messageMods);
						return;
					}

					const accountList = (storage.accountOrder || [])
						.filter(id => accounts[id])
						.map((id, index) => {
							const account = accounts[id];
							const name = formatAccountName(account);
							const addedDate = new Date(account.addedAt).toLocaleDateString();
							return `**${index + 1}.** ${name} - Added: ${addedDate}`;
						})
						.join("\n");

					sendMessage?.({
						loggingName: "List accounts message",
						channelId: ctx.channel.id,
						embeds: [{
							color: EMBED_COLOR(),
							type: "rich",
							title: `📝 Saved Accounts (${accountCount})`,
							description: accountList,
							footer: { text: "Use /accswitcher login <number or username> to switch accounts" }
						}]
					}, messageMods);

				} catch (e) {
					console.error("List accounts error:", e);
					showToast("Failed to list accounts", 1);
				}
			},

			removeAccount(args, ctx) {
				try {
					const messageMods = {
						...authorMods,
						interaction: {
							name: "/accswitcher remove",
							user: UserStore.getCurrentUser(),
						},
					};

					const options = new Map(args.map((a) => [a.name, a]));
					const accountInput = options.get("account")?.value;

					if (!accountInput) {
						sendMessage?.({
							loggingName: "Remove account error message",
							channelId: ctx.channel.id,
							embeds: [{
								color: EMBED_COLOR(),
								type: "rich",
								title: `❌ No Account Specified`,
								description: "Please specify an account number, username, or ID to remove."
							}]
						}, messageMods);
						return;
					}

					const found = findAccountByInput(accountInput);
					if (!found) {
						const availableAccounts = (storage.accountOrder || [])
							.filter(id => storage.accounts[id])
							.map((id, index) => `${index + 1}. ${formatAccountName(storage.accounts[id])}`)
							.join("\n");

						sendMessage?.({
							loggingName: "Remove account error message",
							channelId: ctx.channel.id,
							embeds: [{
								color: EMBED_COLOR(),
								type: "rich",
								title: `❌ Account Not Found`,
								description: `Could not find account "${accountInput}".${availableAccounts ? `\n\n**Available accounts:**\n${availableAccounts}` : '\n\nNo accounts saved yet.'}`
							}]
						}, messageMods);
						return;
					}

					const [accountId, account] = found;
					const index = getAccountIndex(accountId);
					const accountName = `${index}. ${formatAccountName(account)}`;
					
					delete storage.accounts[accountId];
					removeAccountFromOrder(accountId);

					sendMessage?.({
						loggingName: "Remove account success message",
						channelId: ctx.channel.id,
						embeds: [{
							color: EMBED_COLOR(),
							type: "rich",
							title: `🗑️ Account Removed`,
							description: `**${accountName}** has been removed from saved accounts.`,
							footer: { text: `Remaining accounts: ${Object.keys(storage.accounts).length}` }
						}]
					}, messageMods);

				} catch (e) {
					console.error("Remove account error:", e);
					showToast("Failed to remove account", 1);
				}
			},

			getCurrentToken(args, ctx) {
				try {
					const messageMods = {
						...authorMods,
						interaction: {
							name: "/accswitcher token",
							user: UserStore.getCurrentUser(),
						},
					};

					if (!storage.settings?.enableUnsafeFeatures) {
						sendMessage?.({
							loggingName: "Get token disabled message",
							channelId: ctx.channel.id,
							embeds: [{
								color: EMBED_COLOR(),
								type: "rich",
								title: "🔒 Unsafe Features Disabled",
								description: "Token access is disabled. Enable 'Unsafe Features' in plugin settings to use this command."
							}]
						}, messageMods);
						return;
					}

					const { getToken } = findByProps("getToken");
					const token = getToken();

					sendMessage?.({
						loggingName: "Get token message",
						channelId: ctx.channel.id,
						embeds: [{
							color: EMBED_COLOR(),
							type: "rich",
							title: "🔑 Current Account Token",
							description: `\`${token}\``,
							footer: { text: "⚠️ Keep your token secure and never share it!" }
						}]
					}, messageMods);

				} catch (e) {
					console.error("Get token error:", e);
					showToast("Failed to get current token", 1);
				}
			}
		};

		// Register commands
		try {
			const commandsToRegister = [
				{
					type: 1,
					inputType: 1,
					applicationId: "-1",
					execute: commands.mainCommand,
					name: "accswitcher",
					description: "Open Account Switcher (check plugin settings)",
					options: [],
				},
				{
					type: 1,
					inputType: 1,
					applicationId: "-1",
					execute: commands.addAccount,
					name: "accswitcher add",
					description: "Add your current account to saved accounts",
					options: [],
				},
				{
					type: 1,
					inputType: 1,
					applicationId: "-1",
					execute: commands.login,
					name: "accswitcher login",
					description: "Switch to a saved account",
					options: [
						{
							required: true,
							type: 3,
							name: "account",
							description: "Account number, username, or ID to switch to",
						}
					],
				},
				{
					type: 1,
					inputType: 1,
					applicationId: "-1",
					execute: commands.listAccounts,
					name: "accswitcher list",
					description: "Show all saved accounts",
					options: [],
				},
				{
					type: 1,
					inputType: 1,
					applicationId: "-1",
					execute: commands.removeAccount,
					name: "accswitcher remove",
					description: "Remove a saved account",
					options: [
						{
							required: true,
							type: 3,
							name: "account",
							description: "Account number, username, or ID to remove",
						}
					],
				},
				{
					type: 1,
					inputType: 1,
					applicationId: "-1",
					execute: commands.getCurrentToken,
					name: "accswitcher token",
					description: "Get your current account token (requires unsafe features)",
					options: [],
				}
			];

			commandsToRegister.forEach(command => {
				try {
					registerCommand(command);
				} catch (e) {
					console.error(`Failed to register command ${command.name}:`, e);
				}
			});

			console.log("Account Switcher plugin loaded successfully");
		} catch (e) {
			console.error("Failed to register commands:", e);
		}
	}
};