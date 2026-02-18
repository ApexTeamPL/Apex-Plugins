import { storage, manifest } from "@vendetta/plugin";
import { React, NavigationNative } from "@vendetta/metro/common";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { after } from "@vendetta/patcher";
import { Forms } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";
import { findByProps } from "@vendetta/metro";
import { logger } from "@vendetta";
import AccountSwitcherSettings from "./Settings";

const { FormSection, FormRow } = Forms;
const { TableRowIcon } = findByProps("TableRowIcon");

const bunny = typeof window !== 'undefined' ? window.bunny : undefined;
let metro = bunny?.metro;
if (!metro) {
    try {
        metro = require("@vendetta/metro");
    } catch (e) {
        metro = null;
    }
}
const findByNameLazy = metro?.findByNameLazy || metro?.findByName || null;
const findByPropsLazy = metro?.findByPropsLazy || metro?.findByProps || null;

const tabsNavigationRef = findByPropsLazy ? findByPropsLazy("getRootNavigationRef") : null;
const settingConstants = findByPropsLazy ? findByPropsLazy("SETTING_RENDERER_CONFIG") : null;
const SettingsOverviewScreen = findByNameLazy ? findByNameLazy("SettingsOverviewScreen", false) : null;
const createListModule = findByPropsLazy ? findByPropsLazy("createList") : null;

function Section({ tabs }) {
    const navigation = NavigationNative.useNavigation();

    return React.createElement(FormRow, {
        label: tabs.title(),
        leading: React.createElement(FormRow.Icon, { source: tabs.icon }),
        trailing: React.createElement(React.Fragment, {}, [
            tabs.trailing ? tabs.trailing() : null,
            React.createElement(FormRow.Arrow, { key: "arrow" })
        ]),
        onPress: () => {
            const Component = tabs.page;
            navigation.navigate("VendettaCustomPage", {
                title: tabs.title(),
                render: () => React.createElement(Component)
            });
        }
    });
}

function patchPanelUI(tabs, patches) {
    try {
        if (!findByNameLazy) return;
        const WrapperComp = findByNameLazy("UserSettingsOverviewWrapper", false);
        if (!WrapperComp) return;

        patches.push(
            after(
                "default",
                WrapperComp,
                (_, ret) => {
                    const UserSettingsOverview = findInReactTree(
                        ret.props.children,
                        n => n.type?.name === "UserSettingsOverview"
                    );

                    if (UserSettingsOverview) {
                        patches.push(
                            after(
                                "render",
                                UserSettingsOverview.type?.prototype,
                                (_args, res) => {
                                    const sections = findInReactTree(
                                        res.props.children,
                                        n => n?.children?.[1]?.type === FormSection
                                    )?.children;

                                    if (sections) {
                                        const index = sections.findIndex((c) =>
                                            ["BILLING_SETTINGS", "PREMIUM_SETTINGS"].includes(c?.props?.label)
                                        );

                                        sections.splice(
                                            -~index || 4,
                                            0,
                                            React.createElement(Section, { key: tabs.key, tabs })
                                        );
                                    }
                                }
                            )
                        );
                    }
                },
                true
            )
        );
    } catch (error) {
        logger.info("Panel UI patch failed graciously 💔", error);
    }
}

function patchTabsUI(tabs, patches) {
    if (!settingConstants || !SettingsOverviewScreen || !tabsNavigationRef) {
        console.warn("[AccountSwitcher] Missing required constants for tabs UI patch");
        return;
    }

    const row = {};
    row[tabs.key] = {
        type: "pressable",
        title: tabs.title,
        icon: tabs.icon,
        IconComponent: tabs.icon && (() => {
            const actualIconSource = (typeof tabs.icon === 'object' && tabs.icon.uri !== undefined)
                ? tabs.icon.uri
                : tabs.icon;
            return React.createElement(TableRowIcon, { source: actualIconSource });
        }),
        usePredicate: tabs.predicate,
        useTrailing: tabs.trailing,
        onPress: () => {
            const navigation = tabsNavigationRef.getRootNavigationRef();
            const Component = tabs.page;

            navigation.navigate("VendettaCustomPage", {
                title: tabs.title(),
                render: () => React.createElement(Component)
            });
        },
        withArrow: true,
    };

    let rendererConfigValue = settingConstants.SETTING_RENDERER_CONFIG;

    Object.defineProperty(settingConstants, "SETTING_RENDERER_CONFIG", {
        enumerable: true,
        configurable: true,
        get: () => ({
            ...rendererConfigValue,
            ...row,
        }),
        set: v => (rendererConfigValue = v),
    });

    const firstRender = Symbol("AccountSwitcher-pinToSettings");

    try {
        if(!createListModule) return;

        patches.push(
            after("createList", createListModule, (args, ret) => {
                if(!args[0][firstRender]) {
                    args[0][firstRender] = true;

                    const [config] = args;
                    const sections = config.sections;

                    const section = sections?.find((x) =>
                        ["Bunny", "Kettu", "Revenge"].includes(x?.label)
                    );

                    // If unable to find a section
                    if(!section) {
                        const isMainSettings = Boolean(
                            sections?.find((x) => 
                                x.settings.includes("ACCOUNT")
                            )
                        )
                        
                        if(isMainSettings) {
                            // Add a new section to the top
                            sections.unshift({
                                label: manifest.name,
                                title: manifest.name,
                                settings: [tabs.key]
                            });
                        }
                    }

                    if (section?.settings) {
                        section.settings = [...section.settings, tabs.key];
                    }
                }
            })
        )
    } catch {
        patches.push(
        after("default", SettingsOverviewScreen, (args, ret) => {
            if (!args[0][firstRender]) {
                args[0][firstRender] = true;

                const { sections } = findInReactTree(
                    ret,
                    i => i.props?.sections,
                ).props;
                
                const section = sections?.find((x) => 
                    ["Bunny", "Kettu", "Revenge"].includes(x?.label)
                );

                // If unable to find a section
                    if(!section) {
                        const isMainSettings = Boolean(
                            sections?.find((x) => 
                                x.settings.includes("ACCOUNT")
                            )
                        )
                        
                        if(isMainSettings) {
                            // Add a new section to the top
                            sections.unshift({
                                label: manifest.name,
                                title: manifest.name,
                                settings: [tabs.key]
                            });
                        }
                    }

                if (section?.settings) {
                    section.settings = [...section.settings, tabs.key];
                }
            }
        })
    );
    }
}

function patchSettingsPin(tabs) {
    const patches = [];

    let disabled = false;

    const realPredicate = tabs.predicate || (() => true);
    tabs.predicate = () => (disabled ? false : realPredicate());

    patchPanelUI(tabs, patches);
    patchTabsUI(tabs, patches);
    patches.push(() => (disabled = true));

    return () => {
        for (const x of patches) {
            x();
        }
    };
}

export default function patchSidebar() {
    if (!storage.settings?.addToSidebar) {
        console.log("[AccountSwitcher] Sidebar disabled in settings");
        return () => {};
    }

    console.log("[AccountSwitcher] Patching sidebar using custom patchSettingsPin...");

    try {
        const unpatch = patchSettingsPin({
            key: "AccountSwitcher",
            icon: getAssetIDByName("UserIcon"),
            title: () => "Account Switcher",
            predicate: () => storage.settings?.addToSidebar === true,
            page: AccountSwitcherSettings,
        });

        console.log("[AccountSwitcher] Successfully patched sidebar");
        return unpatch;

    } catch (error) {
        console.error("[AccountSwitcher] Failed to patch sidebar:", error);
        return () => {};
    }
}
