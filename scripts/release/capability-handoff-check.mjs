#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { verifyCapabilityHandoff } from './capability-handoff.mjs';
import { loadRegistry, readProjectIdentity, resolveRegistryPath } from './project-routing.mjs';

// Actual local publisher entry point. No cached receipt input and no private roots in source or CI.
const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args], {
  encoding: 'utf8', windowsHide: true,
}).trim();
const root = git('rev-parse', '--show-toplevel');
const headSha = git('rev-parse', 'HEAD');
const identity = readProjectIdentity(root);
const registry = loadRegistry(resolveRegistryPath(), identity);
const proof = verifyCapabilityHandoff({ candidateRoot: root, headSha,
  policy: identity.capabilityHandoff, config: registry.capabilityHandoff });
console.log(JSON.stringify({ ok: true, capabilityHandoff: proof }));
