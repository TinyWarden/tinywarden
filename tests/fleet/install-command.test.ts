import {mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {describe, expect, it} from "vitest";
import {installCommand} from "@/lib/agent-install-command";

describe("Fleet installation command", () => {
  it("rejects shell syntax, whitespace and oversized codes", () => {
    for (const code of ["", "tw_setup_v1.", "wrong.code", "tw_setup_v1.a\n", "tw_setup_v1.a\r\n", "tw_setup_v1.a b", "tw_setup_v1.'; exit 99; #", "tw_setup_v1.$(exit 99)", "tw_setup_v1.`exit 99`", "tw_setup_v1."+"a".repeat(4096)]) {
      expect(installCommand(code)).toBeNull();
    }
  });

  it("delivers the exact code through stdin after a complete successful download", () => {
    const directory=mkdtempSync(join(tmpdir(), "tw-install-command-"));
    try {
      const code="tw_setup_v1.SYNTHETIC_TEST_ONLY_0123-abcd", command=installCommand(code)!;
      expect(command).not.toContain("\n");
      writeFileSync(join(directory,"curl"), "#!/bin/bash\nif [[ $DOWNLOAD_FAIL == 1 ]]; then exit 22; fi\nprintf complete > download\n",{mode:0o700});
      writeFileSync(join(directory,"sudo"), "#!/bin/bash\n[[ -f download ]] || exit 99\nprintf '%s\\n' \"$@\"\n/bin/cat\n",{mode:0o700});
      const run=(failed:boolean)=>spawnSync("/bin/bash",["-c",command],{cwd:directory,env:{PATH:directory,NODE_ENV:"test",DOWNLOAD_FAIL:failed?"1":"0"},encoding:"utf8",timeout:5000});
      const success=run(false);
      expect(success.status).toBe(0);
      expect(success.stderr).toBe("");
      expect(success.stdout).toBe(`bash\ninstall.sh\n--setup-code-stdin\n${code}\n`);
      const failure=run(true);
      expect(failure.status).toBe(22);
      expect(failure.stdout).toBe("");
    } finally { rmSync(directory,{recursive:true,force:true}); }
  });
});
