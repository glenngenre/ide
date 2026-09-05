import {
    fetchLanguages,
} from "../api.js";
import {
    getEditorLanguageMode,
    getLanguageForExtension,
} from "../constants.js";

export function getAuthHeaders(token) {
    return token ? { Authorization: "Bearer " + token } : {};
}

export async function loadLanguagesIntoDropdown(selectElement, authHeaders = {}) {
    const languages = await fetchLanguages(authHeaders);
    const options = languages.map((language) => {
        const option = new Option(language.name, language.id);
        option.setAttribute("language_mode", getEditorLanguageMode(language.name));
        return option;
    });
    selectElement.append(options);
    return languages;
}

export function getSelectedLanguageId(selectElement) {
    return parseInt(selectElement.val(), 10);
}

export function selectLanguageById(selectElement, languageId) {
    const option = selectElement.find(`[value=${languageId}]`);
    if (!option.length) {
        return false;
    }
    option.prop("selected", true);
    selectElement.trigger("change", { skipSetDefaultSourceCodeName: true });
    return true;
}

export function selectLanguageForExtension(selectElement, extension) {
    const language = getLanguageForExtension(extension);
    return selectLanguageById(selectElement, language.language_id);
}

export function applySelectedLanguage({
    sourceEditor,
    selectElement,
    editorState,
    setSourceCodeName,
    skipSetDefaultSourceCodeName = false,
}) {
    if (!sourceEditor) {
        return;
    }

    monaco.editor.setModelLanguage(
        sourceEditor.getModel(),
        selectElement.find(":selected").attr("language_mode"),
    );

    if (
        !skipSetDefaultSourceCodeName &&
        (editorState.fileName === "Untitled" ||
            editorState.fileName.startsWith("Untitled."))
    ) {
        const selectedText = selectElement.find(":selected").text();
        setSourceCodeName(`Untitled.${selectedText.toLowerCase()}`);
    }
}
