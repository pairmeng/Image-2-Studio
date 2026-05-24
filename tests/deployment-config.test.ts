import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("deployment configuration guardrails", () => {
  it("keeps production compose pull-based for web and worker containers", () => {
    const compose = read("docker-compose.yml");

    assert.match(compose, /image:\s+\$\{IMAGE_NAME:-ghcr\.io\/pairmeng\/image-2-studio\}:\$\{IMAGE_TAG:-latest\}/);
    assert.equal((compose.match(/pull_policy:\s+always/g) ?? []).length, 2);
    assert.match(compose, /IMAGE_PROCESS_ROLE:\s+web/);
    assert.match(compose, /IMAGE_PROCESS_ROLE:\s+worker/);
  });

  it("injects the release version into Docker images built by GitHub Actions", () => {
    const dockerfile = read("Dockerfile");
    const workflow = read(".github/workflows/docker-image.yml");

    assert.match(dockerfile, /ARG APP_VERSION=dev/);
    assert.match(dockerfile, /ENV APP_VERSION=\$\{APP_VERSION\}/);
    assert.match(workflow, /echo "version=\$\{version\}" >> "\$\{GITHUB_OUTPUT\}"/);
    assert.match(workflow, /APP_VERSION=\$\{\{ steps\.meta\.outputs\.version \}\}/);
  });

  it("keeps Docker image publishing manually controlled", () => {
    const workflow = read(".github/workflows/docker-image.yml");

    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /ref:\s*\n\s+description: Branch, tag, or commit to build/);
    assert.match(workflow, /publish:\s*\n\s+description: Push the built image to GHCR/);
    assert.match(workflow, /type: boolean/);
    assert.match(workflow, /default: false/);
    assert.match(workflow, /if: github\.event_name == 'workflow_dispatch' && inputs\.publish/);
    assert.match(workflow, /push: \$\{\{ steps\.meta\.outputs\.publish == 'true' \}\}/);
    assert.doesNotMatch(workflow, /push: \$\{\{ github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\) \}\}/);
  });

  it("publishes latest only for manual version refs", () => {
    const workflow = read(".github/workflows/docker-image.yml");

    assert.match(workflow, /version="\$\{ref#refs\/tags\/\}"/);
    assert.match(workflow, /version="\$\{version#refs\/heads\/\}"/);
    assert.match(workflow, /version="\$\{version\/\/\\\/\/-\}"/);
    assert.match(workflow, /if \[\[ "\$\{publish\}" == "true" && "\$\{version\}" == v\* \]\]; then/);
    assert.match(workflow, /tags="\$\{tags\},\$\{IMAGE_NAME\}:latest"/);
    assert.match(workflow, /tags="\$\{IMAGE_NAME\}:\$\{GITHUB_REF_NAME\}"/);
  });

  it("uses the public npm registry for Docker dependency installs", () => {
    const dockerfile = read("Dockerfile");
    const workflow = read(".github/workflows/docker-image.yml");

    assert.match(dockerfile, /ARG NPM_REGISTRY=https:\/\/registry\.npmjs\.org\//);
    assert.match(dockerfile, /CI=true pnpm install --frozen-lockfile/);
    assert.match(workflow, /NPM_REGISTRY:\s+https:\/\/registry\.npmjs\.org\//);
  });

  it("keeps generated worker output out of source control inputs", () => {
    const dockerfile = read("Dockerfile");
    const gitignore = read(".gitignore");
    const dockerignore = read(".dockerignore");

    assert.match(gitignore, /^dist-worker\/$/m);
    assert.match(dockerignore, /^dist-worker\/$/m);
    assert.match(dockerfile, /pnpm build:worker/);
    assert.match(dockerfile, /COPY --from=builder \/app\/dist-worker \.\/dist-worker/);
  });

  it("keeps local dev image publishing separate from production latest", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    const publishScript = read("scripts/publish-image.ps1");

    assert.equal(
      packageJson.scripts?.["publish:dev"],
      "powershell -ExecutionPolicy Bypass -File scripts/publish-image.ps1 -Dev -Verify -RequireClean",
    );

    assert.match(publishScript, /\[switch\]\$Dev/);
    assert.match(publishScript, /\[switch\]\$Verify/);
    assert.match(publishScript, /\[switch\]\$RequireClean/);
    assert.match(publishScript, /\$publishedTags = @\("dev-latest", "dev-\$shortSha"\)/);
    assert.match(publishScript, /\$NoLatest = \$true/);
    assert.match(publishScript, /-Dev cannot be combined with -Tag/);
    assert.match(publishScript, /Release publishing requires -Tag vX\.Y\.Z/);
    assert.match(publishScript, /Working tree is not clean/);
    assert.match(publishScript, /Invoke-CheckedCommand pnpm\.cmd run verify/);
  });

  it("uses a noninteractive lint command", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

    assert.equal(packageJson.scripts?.lint, "eslint .");
    assert.match(packageJson.scripts?.verify ?? "", /pnpm run lint/);
    assert.match(packageJson.scripts?.verify ?? "", /pnpm run test:jobs/);
    assert.match(packageJson.scripts?.verify ?? "", /pnpm run build:worker/);
    assert.match(packageJson.scripts?.verify ?? "", /pnpm run build/);
  });
});
