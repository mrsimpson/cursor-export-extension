const en = require('./locales/en');
const de = require('./locales/de');
const zhCN = require('./locales/zh-CN');

const locales = {
    'en': en,
    'de': de,
    'zh-CN': zhCN
};

function getLocale() {
    // Get system locale
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

    // Fall back to English if locale not supported
    return 'en';
}

function formatString(str, ...args) {
    return str.replace(/{(\d+)}/g, (match, index) => {
        return args[index] !== undefined ? args[index] : match;
    });
}

function t(key, ...args) {
    const locale = getLocale();
    const template = locales[locale][key];
    return formatString(template, ...args);
}

module.exports = { t }; 