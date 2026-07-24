import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { CG_ERROR_CODES, CG_ERROR_REGISTRY, RETIRED_CG_ERROR_CODES } from '../src/errors/index';
import type { CgErrorCode } from '../src/errors/index';

const SOURCE_ROOTS = [
  new URL('../../../apps/', import.meta.url),
  new URL('../../../packages/', import.meta.url),
] as const;

/**
 * Persisted replay tombstones belong here and nowhere else. D26's persistence
 * audit found none: desktop stores no UserFacingError/CgError across process
 * restart, so every current registry code must have a live literal producer.
 */
const TOMBSTONED_REGISTRY_CODES: ReadonlySet<CgErrorCode> = new Set<CgErrorCode>([]);

function excluded(pathname: string): boolean {
  return (
    pathname.includes('/tests/') ||
    pathname.includes('/node_modules/') ||
    pathname.includes('/out/') ||
    pathname.includes('/dist/') ||
    pathname.includes('/packages/kernel-sdk/') ||
    pathname.includes('/src/renderer/src/dev/') ||
    pathname.endsWith('/packages/shared/src/errors/index.ts') ||
    pathname.endsWith('/packages/shared/src/i18n/catalog.ts')
  );
}

function sourceFiles(directory: URL): URL[] {
  if (excluded(directory.pathname)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) return sourceFiles(child);
    return entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.gen.ts') &&
      !excluded(child.pathname)
      ? [child]
      : [];
  });
}

function codeOf(node: ts.StringLiteralLike): string | null {
  return /^CG-[A-Z]+-\d+$/.test(node.text) ? node.text : null;
}

function calledName(expression: ts.LeftHandSideExpression): string | null {
  return ts.isIdentifier(expression) ? expression.text : null;
}

function propertyName(node: ts.PropertyName): string | null {
  return ts.isIdentifier(node) || ts.isStringLiteralLike(node) ? node.text : null;
}

function isReturned(node: ts.StringLiteralLike): boolean {
  for (let parent: ts.Node | undefined = node.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isReturnStatement(parent)) return true;
    if (ts.isArrowFunction(parent)) return !ts.isBlock(parent.body);
    if (ts.isSourceFile(parent)) return false;
  }
  return false;
}

function isLiteralProducer(node: ts.StringLiteralLike): boolean {
  const parent = node.parent;
  if (
    ts.isNewExpression(parent) &&
    parent.arguments?.[0] === node &&
    ['CgError', 'OfApiError'].includes(calledName(parent.expression) ?? '')
  ) {
    return true;
  }
  if (
    ts.isCallExpression(parent) &&
    parent.arguments[0] === node &&
    ['createUserFacing', 'describeError'].includes(calledName(parent.expression) ?? '')
  ) {
    return true;
  }
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    const name = propertyName(parent.name);
    if (name === 'errorCode' || name === 'authErrorCode' || name?.startsWith('provider_')) {
      return true;
    }
  }
  return isReturned(node);
}

function literalProducerCodes(): Set<string> {
  const codes = new Set<string>();
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, 'utf8');
      const sourceFile = ts.createSourceFile(
        file.pathname,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.pathname.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const visit = (node: ts.Node): void => {
        if (ts.isStringLiteralLike(node) && isLiteralProducer(node)) {
          const code = codeOf(node);
          if (code !== null) codes.add(code);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
  }
  return codes;
}

describe('error registry producer consistency', () => {
  it('ties every live registry code to a literal apps/packages producer', () => {
    const producers = literalProducerCodes();
    const missing = CG_ERROR_CODES.filter((code) => !TOMBSTONED_REGISTRY_CODES.has(code) && !producers.has(code));

    expect(missing).toEqual([]);
    expect([...TOMBSTONED_REGISTRY_CODES].filter((code) => !Object.hasOwn(CG_ERROR_REGISTRY, code))).toEqual([]);
    expect([...TOMBSTONED_REGISTRY_CODES].filter((code) => producers.has(code))).toEqual([]);
    expect(RETIRED_CG_ERROR_CODES.filter((code) => producers.has(code))).toEqual([]);
    expect(RETIRED_CG_ERROR_CODES.filter((code) => Object.hasOwn(CG_ERROR_REGISTRY, code))).toEqual([]);
  });
});
