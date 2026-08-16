import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const PROBE_ENV = 'PASS71_EDGE_EXE_PROBE_PATH';

export function readWindowsExecutableIdentity(executable, options = {}) {
  const absolute = resolve(executable);
  const powershell = options.powershell ?? resolve(
    process.env.SystemRoot ?? 'C:/Windows',
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  );
  const script = [
    '$ErrorActionPreference = "Stop"',
    `$target = $env:${PROBE_ENV}`,
    'if ([string]::IsNullOrWhiteSpace($target)) { throw "Executable probe target is unavailable" }',
    '$item = Get-Item -LiteralPath $target',
    '$signature = Get-AuthenticodeSignature -LiteralPath $target',
    '$signerSubject = if ($null -eq $signature.SignerCertificate) { "" } else { $signature.SignerCertificate.Subject }',
    '$identity = [ordered]@{ productVersion = $item.VersionInfo.ProductVersion; signatureStatus = $signature.Status.ToString(); signerSubject = $signerSubject }',
    '$identity | ConvertTo-Json -Compress',
  ].join('; ');
  const raw = execFileSync(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, [PROBE_ENV]: absolute },
  });
  const identity = JSON.parse(raw);
  return Object.freeze({
    executablePath: absolute,
    installRoot: dirname(absolute),
    productVersion: String(identity.productVersion ?? '').trim(),
    signatureStatus: String(identity.signatureStatus ?? '').trim(),
    signerSubject: String(identity.signerSubject ?? '').trim(),
  });
}

export function assertInstalledEdgeExecutableIdentity(identity) {
  if (!identity || !/^\d+(?:\.\d+){3}$/u.test(identity.productVersion ?? '')) {
    throw new Error('Installed Edge ProductVersion is unavailable or non-canonical');
  }
  if (!/[\\/]Microsoft[\\/]Edge[\\/]Application$/iu.test(identity.installRoot ?? '')) {
    throw new Error(`Installed Edge root is not canonical: ${identity.installRoot ?? '(missing)'}`);
  }
  if (identity.signatureStatus !== 'Valid' || !/\bMicrosoft Corporation\b/iu.test(identity.signerSubject ?? '')) {
    throw new Error(`Installed Edge Authenticode identity is invalid: ${identity.signatureStatus ?? '(missing)'}`);
  }
  return identity;
}
