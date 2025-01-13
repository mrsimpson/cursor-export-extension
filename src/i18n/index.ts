import * as vscode from 'vscode';
import { Translations } from './types';

// Import translations directly from JavaScript files
const en = require('../../scripts/locales/en') as Translations;
const de = require('../../scripts/locales/de') as Translations;
const zhCN = require('../../scripts/locales/zh-CN') as Translations;

const locales: { [key: string]: Translations } = {
    'en': en,
    'de': de,
    'zh-CN': zhCN
};

export function getLocale(): string {
    try {
        // Try to get VS Code's display language if available
        const vsCodeLocale = vscode.env.language;

        // Check if we support this locale
        if (locales[vsCodeLocale]) {
            return vsCodeLocale;
        }

        // Check if we support the language part
        const lang = vsCodeLocale.split('-')[0];
        if (locales[lang]) {
            return lang;
        }
    } catch (error) {
        // VS Code module not available, try to get system locale
        const sysLocale = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || process.env.LC_MESSAGES || 'en';
        const locale = sysLocale.split('.')[0].replace('_', '-');

        // Check if we support this locale
        if (locales[locale]) {
            return locale;
        }

        // Check if we support the language part
        const lang = locale.split('-')[0];
        if (locales[lang]) {
            return lang;
        }
    }

    // Fall back to English if locale not supported
    return 'en';
}

function formatString(str: string, ...args: any[]): string {
    return str.replace(/{(\d+)}/g, (match, index) => {
        return args[index] !== undefined ? args[index] : match;
    });
}

// Update the t function to accept additional arguments
export function t(key: keyof Translations, ...args: any[]): string {
    const locale = getLocale();
    const template = locales[locale][key];
    return formatString(template, ...args);
} 