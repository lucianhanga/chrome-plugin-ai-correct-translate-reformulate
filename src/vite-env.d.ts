// src/vite-env.d.ts
// Type declarations for Vite-specific import patterns used in this project.

/// <reference types="vite/client" />

// Allow importing CSS files as inline strings (e.g. `import css from './file.css?inline'`)
declare module '*.css?inline' {
  const content: string;
  export default content;
}

// Allow importing CSS files as side-effects (e.g. `import './popup.css'`)
declare module '*.css' {
  const content: string;
  export default content;
}
