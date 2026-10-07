// Development-only experiment is not imported, compiled or exposed by runtime.
export const developmentOnlyFiles=Object.freeze(['src/native-console-prototype.cs','test/console-prototype.test.mjs']);
export function runtimeFiles(names){return names.filter(name=>!developmentOnlyFiles.includes(name));}
