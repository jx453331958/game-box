import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

// eslint-config-next 15 still ships an eslintrc-style config, so ESLint 9's
// flat config loads it through FlatCompat. This is the layout Next documents.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  { ignores: ['.next/**', 'dist/**', 'node_modules/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
]

export default eslintConfig
