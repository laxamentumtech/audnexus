const path = process.argv[2] || "docs/spec/audnexus.yaml";
const ref = process.env.DOCS_REF || "";
const source = process.env.DOCS_SOURCE || "";
const expectedSource = process.env.DOCS_EXPECTED_SOURCE || "";
const requested = process.env.DOCS_VERSION || "";
const semver = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

if (source && !/^[a-f0-9]{40}$/.test(source)) {
	throw new Error("Docs source must be an exact commit SHA");
}
if (expectedSource && expectedSource !== source) {
	throw new Error("Docs dispatch does not match the reserved release source");
}
if (requested && (!semver.test(requested) || ref !== `refs/tags/${requested}`)) {
	throw new Error("Explicit docs versions require the matching immutable release tag");
}
const tag = ref.startsWith("refs/tags/") ? ref.slice("refs/tags/".length) : "";
const version = requested || (semver.test(tag) ? tag : "");
const label = version ? version.slice(1) : source ? `dev-${source.slice(0, 12)}` : "dev";
const spec = Bun.YAML.parse(await Bun.file(path).text()) as { info?: { version?: string } };
if (!spec.info || typeof spec.info !== "object") {
	throw new Error("OpenAPI info section is missing");
}
spec.info.version = label;
await Bun.write(path, Bun.YAML.stringify(spec));
console.log(`Docs version: ${label}; source: ${source || "unconfigured"}`);
