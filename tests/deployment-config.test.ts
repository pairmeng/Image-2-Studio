import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("deployment configuration guardrails", () => {
  it("keeps production compose pull-based for web and worker containers", () => {
    const compose = read("docker-compose.yml");

    assert.match(compose, /image:\s+\$\{IMAGE_NAME:-ghcr\.io\/paimonria\/image-2-studio\}:\$\{IMAGE_TAG:-latest\}/);
    assert.equal((compose.match(/pull_policy:\s+always/g) ?? []).length, 2);
    assert.match(compose, /IMAGE_PROCESS_ROLE:\s+web/);
    assert.match(compose, /IMAGE_PROCESS_ROLE:\s+worker/);
  });

  it("adds a single-host scale overlay for web and worker replicas", () => {
    const compose = read("docker-compose.yml");
    const scaleCompose = read("docker-compose.scale.yml");
    const nginxConfig = read("deploy/nginx/scale.conf");
    const envExample = read(".env.example");

    assert.match(scaleCompose, /image-2-migrate:/);
    assert.match(scaleCompose, /IMAGE_PROCESS_ROLE:\s+migrate/);
    assert.match(scaleCompose, /profiles:\s*\n\s+- migrate/);
    assert.match(scaleCompose, /image-2-proxy:/);
    assert.match(scaleCompose, /nginx:1\.27-alpine/);
    assert.match(scaleCompose, /\$\{APP_PORT:-3000\}:80/);
    assert.match(scaleCompose, /container_name:\s+null/);
    assert.match(scaleCompose, /ports:\s+\[\]/);
    assert.match(scaleCompose, /expose:\s*\n\s+- "3000"/);
    assert.match(scaleCompose, /DB_MIGRATE_ON_START:\s+"false"/);
    assert.match(scaleCompose, /WEB_REPLICAS:-2/);
    assert.match(scaleCompose, /WORKER_REPLICAS:-2/);
    assert.match(scaleCompose, /DATABASE_CONNECTION_LIMIT:-5/);
    assert.match(scaleCompose, /WORKER_DATABASE_CONNECTION_LIMIT:-5/);

    assert.match(nginxConfig, /upstream image2_web/);
    assert.match(nginxConfig, /server image-2-studio:3000 resolve/);
    assert.match(nginxConfig, /proxy_set_header Host \$host/);
    assert.match(nginxConfig, /proxy_set_header X-Forwarded-Proto \$scheme/);

    assert.match(envExample, /^WEB_REPLICAS=2$/m);
    assert.match(envExample, /^WORKER_REPLICAS=2$/m);
    assert.match(envExample, /^MIGRATE_DATABASE_CONNECTION_LIMIT=5$/m);

    assert.match(compose, /image-2-worker:/);
  });

  it("injects the release version into Docker images built by GitHub Actions", () => {
    const dockerfile = read("Dockerfile");
    const workflow = read(".github/workflows/docker-image.yml");

    assert.match(dockerfile, /ARG APP_VERSION=dev/);
    assert.match(dockerfile, /ENV APP_VERSION=\$\{APP_VERSION\}/);
    assert.match(workflow, /IMAGE_NAME:\s+ghcr\.io\/\$\{\{ github\.repository_owner \}\}\/image-2-studio/);
    assert.match(workflow, /echo "version=\$\{version\}" >> "\$\{GITHUB_OUTPUT\}"/);
    assert.match(workflow, /APP_VERSION=\$\{\{ steps\.meta\.outputs\.version \}\}/);
  });

  it("runs the application verification gate before Docker build and publish", () => {
    const workflow = read(".github/workflows/docker-image.yml");
    const verifyIndex = workflow.indexOf("run: pnpm verify");
    const buildxIndex = workflow.indexOf("uses: docker/setup-buildx-action");
    const buildPushIndex = workflow.indexOf("uses: docker/build-push-action");

    assert.notEqual(verifyIndex, -1);
    assert.notEqual(buildxIndex, -1);
    assert.notEqual(buildPushIndex, -1);
    assert.ok(verifyIndex < buildxIndex);
    assert.ok(verifyIndex < buildPushIndex);
  });

  it("keeps pull requests non-publishing while allowing controlled manual publishing", () => {
    const workflow = read(".github/workflows/docker-image.yml");

    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /ref:\s*\n\s+description: Branch, tag, or commit to build/);
    assert.match(workflow, /publish:\s*\n\s+description: Push the built image to GHCR/);
    assert.match(workflow, /channel:\s*\n\s+description: Image publish channel/);
    assert.match(workflow, /default: dev/);
    assert.match(workflow, /-\s+dev/);
    assert.match(workflow, /-\s+release/);
    assert.match(workflow, /type: boolean/);
    assert.match(workflow, /default: false/);
    assert.match(
      workflow,
      /if: \(github\.event_name == 'workflow_dispatch' && inputs\.publish\) \|\| \(github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\)\)/,
    );
    assert.match(workflow, /push: \$\{\{ steps\.meta\.outputs\.publish == 'true' \}\}/);
  });

  it("publishes dev tags manually and latest for release tags", () => {
    const workflow = read(".github/workflows/docker-image.yml");

    assert.match(workflow, /channel="\$\{SELECTED_CHANNEL:-dev\}"/);
    assert.match(workflow, /short_sha="\$\(git rev-parse --short HEAD\)"/);
    assert.match(workflow, /version="dev-\$\{short_sha\}"/);
    assert.match(workflow, /tags="\$\{IMAGE_NAME\}:dev-latest,\$\{IMAGE_NAME\}:dev-\$\{short_sha\}"/);
    assert.match(workflow, /version="\$\{ref#refs\/tags\/\}"/);
    assert.match(workflow, /version="\$\{version#refs\/heads\/\}"/);
    assert.match(workflow, /version="\$\{version\/\/\\\/\/-\}"/);
    assert.match(workflow, /Release publishing requires a v\* ref/);
    assert.match(workflow, /tags="\$\{tags\},\$\{IMAGE_NAME\}:latest"/);
    assert.match(workflow, /publish="true"\s+tags="\$\{IMAGE_NAME\}:\$\{GITHUB_REF_NAME\},\$\{IMAGE_NAME\}:latest"/);
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
    assert.doesNotMatch(dockerignore, /^deploy\/$/m);
    assert.match(dockerfile, /pnpm build:worker/);
    assert.match(dockerfile, /COPY --from=builder \/app\/dist-worker \.\/dist-worker/);
  });

  it("supports a one-shot migration process role for scaled deployments", () => {
    const entrypoint = read("scripts/docker-entrypoint.sh");

    assert.match(entrypoint, /IMAGE_PROCESS_ROLE:-web}" = "migrate"/);
    assert.match(entrypoint, /should_migrate="true"/);
    assert.match(entrypoint, /migrate\)\s+echo "Migration role completed\."/);
    assert.match(entrypoint, /IMAGE_PROCESS_ROLE must be web or worker/);
  });

  it("keeps local dev image publishing separate from production latest", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    const actionScript = read("scripts/publish-dev-action.ps1");
    const publishScript = read("scripts/publish-image.ps1");

    assert.equal(
      packageJson.scripts?.["publish:dev"],
      "powershell -ExecutionPolicy Bypass -File scripts/publish-dev-action.ps1 -Verify -RequireClean",
    );
    assert.equal(
      packageJson.scripts?.["publish:dev:docker"],
      "powershell -ExecutionPolicy Bypass -File scripts/publish-image.ps1 -Dev -Verify -RequireClean",
    );

    assert.match(actionScript, /gh workflow run \$Workflow --ref \$WorkflowRef -f "ref=\$Ref" -f "channel=dev" -f "publish=true"/);
    assert.match(actionScript, /Invoke-CheckedCommand pnpm\.cmd run verify/);
    assert.match(actionScript, /Working tree is not clean/);
    assert.match(actionScript, /Push main before publishing dev images/);

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

  it("keeps the verification gate runnable on Linux CI", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    const validateScript = read("scripts/db-validate-sqlite.mjs");

    assert.equal(packageJson.scripts?.["db:validate"], "node scripts/db-validate-sqlite.mjs");
    assert.doesNotMatch(packageJson.scripts?.verify ?? "", /powershell|pnpm\.cmd/);
    assert.doesNotMatch(packageJson.scripts?.["db:validate"] ?? "", /powershell|pnpm\.cmd/);
    assert.match(validateScript, /DATABASE_URL/);
    assert.match(validateScript, /file:\.\/dev\.db/);
    assert.match(validateScript, /prisma", "validate"/);
  });
});
