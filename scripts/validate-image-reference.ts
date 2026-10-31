// Preflight validator for AUDNEXUS_IMAGE: accepts only version tags and
// digest pins, and rejects mutable references (unset/empty, :latest,
// untagged repos). Compose keeps ${AUDNEXUS_IMAGE:?...} as the hard
// requirement; this adds deploy-time proof the value is immutable.
//
// Usage:
//   bun scripts/validate-image-reference.ts [reference]
// Uses AUDNEXUS_IMAGE when no reference argument is given.

const COMPONENT = "[a-z0-9]+(?:(?:[._]|__)[-a-z0-9]+)*"
const REGISTRY = `(?:${COMPONENT}(?:\\.${COMPONENT})*(?::[0-9]+)?/)`
const NAME = `(?:${REGISTRY})?${COMPONENT}(?:/${COMPONENT})*`
const NAME_RE = new RegExp(`^${NAME}$`)
const DIGEST_SUFFIX_RE = /^@sha256:[0-9a-f]{64}$/
const VERSION_RE = /^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/

export function immutableImageReferenceReason(value: string | null | undefined): string | null {
	if (value === undefined || value === null || value.trim() === "") {
		return "AUDNEXUS_IMAGE is unset or empty"
	}
	if (/\s/.test(value) || /[^A-Za-z0-9._:@/-]/.test(value)) {
		return "AUDNEXUS_IMAGE must not contain whitespace or non-reference characters"
	}
	const reference = value
	const digestAt = reference.lastIndexOf("@")
	if (digestAt >= 0) {
		if (!DIGEST_SUFFIX_RE.test(reference.slice(digestAt))) {
			return "Digest pins must use the @sha256:<64 lowercase hex> form"
		}
		const name = reference.slice(0, digestAt)
		if (!name.includes("/") || !NAME_RE.test(name)) {
			return "Digest pins must identify a full repository path"
		}
		return null
	}
	const slash = reference.lastIndexOf("/")
	const colon = reference.lastIndexOf(":")
	if (colon >= 0 && colon > slash) {
		const tag = reference.slice(colon + 1)
		if (tag === "latest") {
			return ":latest is a mutable alias"
		}
		if (VERSION_RE.test(tag)) {
			return null
		}
		return `Image tag ${tag} is not an immutable version tag; use vX.Y.Z or a sha256 digest pin`
	}
	if (VERSION_RE.test(reference)) {
		return null
	}
	return "Untagged image references resolve to mutable :latest; use a version tag or digest pin"
}

function main(): void {
	const value = process.argv[2] ?? process.env.AUDNEXUS_IMAGE
	const reason = immutableImageReferenceReason(value)
	if (reason) {
		console.error(`Invalid AUDNEXUS_IMAGE reference: ${reason}`)
		process.exit(1)
	}
	console.log(`Immutable AUDNEXUS_IMAGE reference: ${value}`)
}

if (import.meta.main) {
	main()
}
