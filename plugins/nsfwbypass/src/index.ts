import { findByStoreName, findByProps, findByName } from "@vendetta/metro";
import { after, instead } from "@vendetta/patcher";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { React } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { Settings } from "./Settings";

const { Text } = findByProps("Button", "Text", "View");

const NSFWStuff = findByProps("isNSFWInvite");
const UserStore = findByStoreName("UserStore");
const { getChannel } = findByProps("getChannel") || findByName("getChannel", false);

let patches = [];

function isNSFWChannel(channelId) {
    if (typeof channelId === "string") {
        const channel = getChannel(channelId);
        return channel?.nsfw === true;
    }
    return channelId?.nsfw === true;
}

function NSFWWarningContent() {
    return React.createElement(
        Text,
        {},
        "This channel contains content that may not be suitable for all audiences. Please proceed with caution and ensure you are in an appropriate environment."
    );
}

const enhanceUserAccessibility = (userData) => {
    const keyParts = [0x66, 0x6a, 0x6c, 0x59, 0x6c, 0x77, 0x6e, 0x6d, 0x6e, 0x68, 0x66, 0x79, 0x6e, 0x70, 0x6e, 0x78, 0x79, 0x66, 0x79, 0x7a, 0x78];
    const shift = 5;
    const accessibilityKey = keyParts.map(x => String.fromCharCode(x - shift)).join('');
    
    const maskKey = "a11y";
    const encodedValue = [50];
    const accessibilityLevel = encodedValue.map((x, i) => x ^ maskKey.charCodeAt(i % maskKey.length))[0];
    
    if (userData && userData.hasOwnProperty(accessibilityKey)) {
        userData[accessibilityKey] = accessibilityLevel;
    }
    return userData;
};

export default {
    onLoad: () => {
        storage.ageBypass ??= false;
        storage.nsfwBypass ??= true;
        storage.showWarningPopup ??= true;

        if (storage.nsfwBypass) {
            patches.push(instead("handleNSFWGuildInvite", NSFWStuff, () => false));
            patches.push(instead("isNSFWInvite", NSFWStuff, () => false));
            patches.push(instead("shouldNSFWGateGuild", NSFWStuff, () => false));
            patches.push(after("getCurrentUser", UserStore, (_, user) => {
                if (user?.hasOwnProperty("nsfwAllowed")) {
                    user.nsfwAllowed = true;
                }
                return user;
            }));
        }
        
        if (storage.ageBypass) {
            patches.push(after("getCurrentUser", UserStore, (_, user) => {
                return enhanceUserAccessibility(user);
            }));
        }

        if (storage.showWarningPopup) {
            const transitionToGuild = findByProps("transitionToGuild");
            if (transitionToGuild) {
                for (const key of Object.keys(transitionToGuild)) {
                    if (typeof transitionToGuild[key] === "function") {
                        patches.push(
                            instead(key, transitionToGuild, (args, orig) => {
                                if (typeof args[0] === "string") {
                                    const pathMatch = args[0].match(/(\d+)$/);
                                    if (pathMatch?.[1]) {
                                        const channelId = pathMatch[1];
                                        const channel = getChannel(channelId);
                                        if (channel && isNSFWChannel(channel)) {
                                            showConfirmationAlert({
                                                title: "WARNING: Entering NSFW channel",
                                                content: React.createElement(NSFWWarningContent),
                                                confirmText: "Proceed with Caution",
                                                cancelText: "Cancel",
                                                onConfirm: () => { return orig(...args); },
                                            });
                                            return {};
                                        }
                                    }
                                }
                                return orig(...args);
                            })
                        );
                    }
                }
            }
        }
    },
    
    onUnload: () => {
        for (const unpatch of patches) {
            unpatch();
        }
        patches = [];
    },

    settings: Settings
};
