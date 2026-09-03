# DRAFT: cmd.exe batch files with LF-only line endings mishandle `call :label`

Date: 2026-09-03

**Symptom.** A locally authored Windows batch launcher (the port-8090 Qwen launcher from the overnight Qwen experiment) misbehaved when driven from cmd.exe: its `call :label` subroutine handling did not behave as the author expected, and the launcher needed repair rather than a simple re-run.

**Cause (SUSPECTED).** cmd.exe parses batch files with line-ending-sensitive label scanning: `call :label` targets in an LF-only (Unix line-ending) batch file are not reliably recognized, so subroutines fall through or the script loops. *Evidence gap: no ledger line in `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` HF-434..HF-444 or the PASS 92 publish record covers this finding; drafted from the 2026-09-03 Q4 job candidate text only. The related port-8090 move itself is HF-445 (loopback 8080 held by the WSL docker-proxy).*

**Correction.** Author Windows batch files with CRLF line endings (e.g. Python `newline='\r\n'`, or check out with `*.bat` CRLF in `.gitattributes`), and keep the repo's LF pinning rule for source files (HF-412/LANE_Q precedent) separate from the .bat/.cmd convention.

**Verify.** Run the launcher under a real cmd.exe (not PowerShell/shell translation) and confirm the `call :label` jump lands on the intended subroutine and the script exits cleanly; `file`/hexdump the .bat to confirm CRLF endings.
