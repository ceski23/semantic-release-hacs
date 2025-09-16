export const detectJsonFormatting = (file: string) => {
	const match = file.match(/^{?([\t ]*)"/m)
	const matchedGroup = match?.at(1)

	if (!matchedGroup) {
		return undefined
	}

	const count = matchedGroup.split('').length

	return matchedGroup.charAt(0) === ' '
		? count
		: matchedGroup.charAt(0)
}
