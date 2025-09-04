import ts from "typescript";

export const getCanonicalFileName = ts.createGetCanonicalFileName(ts.sys.useCaseSensitiveFileNames);

export function toPath(fileName: string): string {
  return ts.toPath(fileName, ts.sys.getCurrentDirectory(), getCanonicalFileName);
}
