import SemanticReleaseError from '@semantic-release/error'
import archiver from 'archiver'
import fsExists from 'fs.promises.exists'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { PrepareContext, PublishContext, VerifyConditionsContext } from 'semantic-release'
import z from 'zod'
import { detectJsonFormatting } from './utils'

const configSchema = z.object({
	manifestPath: z.string().nonempty(),
})

export const verifyConditions = async (pluginConfig: unknown, context: VerifyConditionsContext) => {
	const { data: config, error } = configSchema.safeParse(pluginConfig)

	if (error !== undefined) {
		context.logger.error(`Invalid config: ${z.prettifyError(error)}`)
		throw new SemanticReleaseError('Invalid config', undefined, z.prettifyError(error))
	}

	const hacsManifestPath = path.resolve(process.cwd(), 'hacs.json')

	if (await fsExists(hacsManifestPath) === false) {
		context.logger.error('hacs.json not found')
		throw new SemanticReleaseError('hacs.json not found')
	}

	const haManifestPath = path.resolve(process.cwd(), config.manifestPath)

	if (await fsExists(haManifestPath) === false) {
		context.logger.error('Home Assistant manifest not found')
		throw new SemanticReleaseError('Home Assistant manifest not found')
	}

	let haManifestContent: any
	try {
		const content = await fs.readFile(haManifestPath, { encoding: 'utf8' })
		haManifestContent = JSON.parse(content)
	} catch (error) {
		context.logger.error('Could not parse Home Assistant manifest')
		throw new SemanticReleaseError(
			'Could not parse Home Assistant manifest',
			undefined,
			error instanceof Error ? error.message : undefined,
		)
	}

	context.logger.log('hacs.json and manifest.json files verified')
}

export const prepare = async (config: z.infer<typeof configSchema>, context: PrepareContext) => {
	const haManifestPath = path.resolve(process.cwd(), config.manifestPath)
	const text = await fs.readFile(haManifestPath, { encoding: 'utf8' })

	let content = JSON.parse(text)
	content.version = context.nextRelease.version

	const newContent = JSON.stringify(content, undefined, detectJsonFormatting(text))

	await fs.writeFile(haManifestPath, newContent)

	context.logger.log(`Updated manifest.json version to ${context.nextRelease.version}`)
}

export const publish = async (config: z.infer<typeof configSchema>, context: PublishContext) => {
	const hacsManifestPath = path.resolve(process.cwd(), 'hacs.json')
	const hacs = JSON.parse(await fs.readFile(hacsManifestPath, { encoding: 'utf8' }))

	if (!('zip_release' in hacs)) {
		context.logger.info('zip_release is not set to true - skipping publish step')
		return
	}

	if (!('filename' in hacs)) {
		context.logger.error('No filename set in hacs.json')
		throw new SemanticReleaseError('No filename set in hacs.json')
	}

	if (!('name' in hacs)) {
		context.logger.error('No name set in hacs.json')
		throw new SemanticReleaseError('No name set in hacs.json')
	}

	const contentDir = path.dirname(path.join(process.cwd(), config.manifestPath))
	const archive = archiver('zip')
	const output = createWriteStream(path.join(process.cwd(), hacs.filename))

	archive.pipe(output)
	archive.directory(contentDir, false)
	await archive.finalize()

	context.logger.log(`Created ${hacs.filename} archive with files`)
}
