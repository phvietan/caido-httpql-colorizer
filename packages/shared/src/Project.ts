import type { Settings } from "./index";
import { Setting } from "./Setting";

export type StoredSettings = {
  settingsByProject: Record<string, Settings>;
};

export class Project {
  setting: Setting;

  constructor(public readonly id: string, settings: Settings = new Setting(), public name = "") {
    this.setting = new Setting(settings);
  }

  copyRulesFrom(source: Project, uid: () => string): Setting {
    const copied = source.setting.copyRules(uid);
    this.setting.groups.push(...copied.groups);
    this.setting.rules.push(...copied.rules);
    return copied;
  }
}
