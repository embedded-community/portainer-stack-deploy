import { PortainerApi } from './api'
import { EnvVariables } from './api'
import path from 'path'
import fs from 'fs'
import Handlebars from 'handlebars'
import * as core from '@actions/core'

type DeployStack = {
  portainerHost: string
  username: string
  password: string
  swarmId?: string
  endpointId: number
  stackName: string
  stackDefinitionFile?: string
  templateVariables?: object
  envVariables?: EnvVariables
  image?: string
  pruneStack?: boolean
  pullImage?: boolean
}

enum StackType {
  SWARM = 1,
  COMPOSE = 2
}

export function parseEnvVariables(envVariables: string): EnvVariables {
  const normalizedEnvVariables = envVariables.replace(/\\n/g, '\n').trim()
  core.debug(`Parsing env variables: ${normalizedEnvVariables.replace(/\n/g, '\n')}`)
  return normalizedEnvVariables
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const [name, ...rest] = line.split('=')
      const value = rest.join('=').trim()
      core.debug(`Parsing env variable: ${name}=${value.replace(/\n/g, '\n')}`)
      return {
        name: name.trim(),
        value: value
      }
    })
}

export function mergeEnvVariables(original: EnvVariables, updates: EnvVariables): EnvVariables {
  const mergedMap = new Map<string, string>()

  // Step 1: Add original variables
  for (const variable of original) {
    mergedMap.set(variable.name, variable.value)
  }

  // Step 2: Apply updates (overwrite or add)
  for (const variable of updates) {
    mergedMap.set(variable.name, variable.value)
  }

  // Step 3: Convert map back to array
  return Array.from(mergedMap.entries()).map(([name, value]) => ({ name, value }))
}

function generateNewStackDefinition(
  stackDefinitionFile?: string,
  templateVariables?: object,
  image?: string
): string | undefined {
  if (!stackDefinitionFile) {
    core.info(`No stack definition file provided. Will not update stack definition.`)
    return undefined
  }

  const stackDefFilePath = path.join(process.env.GITHUB_WORKSPACE as string, stackDefinitionFile)
  core.info(`Reading stack definition file from ${stackDefFilePath}`)
  let stackDefinition = fs.readFileSync(stackDefFilePath, 'utf8')
  if (!stackDefinition) {
    throw new Error(`Could not find stack-definition file: ${stackDefFilePath}`)
  }

  if (templateVariables) {
    core.info(`Applying template variables for keys: ${Object.keys(templateVariables)}`)
    stackDefinition = Handlebars.compile(stackDefinition)(templateVariables)
  }

  if (!image) {
    core.info(`No new image provided. Will use image in stack definition.`)
    return stackDefinition
  }

  const imageWithoutTag = image.substring(0, image.indexOf(':'))
  core.info(`Inserting image ${image} into the stack definition`)
  const imageWithoutTagEscaped = imageWithoutTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special characters
  const regex = new RegExp(`^(\\s*image:\\s*['"]?)${imageWithoutTagEscaped}(:[^'"]*)?(['"]?)`, 'gm')
  const output = stackDefinition.replace(regex, `$1${image}$3`)
  core.debug(`Updated stack definition:\n${output}`)
  return output
}

export async function deployStack({
  portainerHost,
  username,
  password,
  swarmId,
  endpointId,
  stackName,
  stackDefinitionFile,
  templateVariables,
  envVariables,
  image,
  pruneStack,
  pullImage
}: DeployStack): Promise<void> {
  const portainerApi = new PortainerApi(portainerHost)

  const stackDefinitionToDeploy = generateNewStackDefinition(
    stackDefinitionFile,
    templateVariables,
    image
  )
  if (stackDefinitionToDeploy) core.debug(stackDefinitionToDeploy)

  core.info('Logging in to Portainer instance...')
  await portainerApi.login({
    username,
    password
  })

  try {
    const allStacks = await portainerApi.getStacks()
    const existingStack = allStacks.find(s => {
      return s.Name === stackName && s.EndpointId === endpointId
    })

    if (existingStack) {
      core.info(`Found existing stack with name: ${stackName}`)
      core.info('Updating existing stack...')

      if (envVariables) {
        if (!existingStack.Env) {
          existingStack.Env = []
        }
        core.debug(`Updating environment variables for stack: ${stackName}`)
        core.debug(`Old environment variables: ${JSON.stringify(existingStack.Env)}`)
        existingStack.Env = mergeEnvVariables(existingStack.Env, envVariables)
        core.info(`Updated environment variables: ${JSON.stringify(existingStack.Env)}`)
      } else {
        core.info('No environment variables provided, keeping existing ones.')
      }
      await portainerApi.updateStack(
        existingStack.Id,
        {
          endpointId: existingStack.EndpointId
        },
        {
          env: existingStack.Env,
          stackFileContent: stackDefinitionToDeploy,
          prune: pruneStack ?? false,
          pullImage: pullImage ?? false
        }
      )
      core.info('Successfully updated existing stack')
    } else {
      if (!stackDefinitionToDeploy) {
        throw new Error(
          `Stack with name ${stackName} does not exist and no stack definition file was provided.`
        )
      }
      core.info('Deploying new stack...')
      await portainerApi.createStack(
        {
          type: swarmId ? StackType.SWARM : StackType.COMPOSE,
          method: 'string',
          endpointId
        },
        {
          name: stackName,
          stackFileContent: stackDefinitionToDeploy,
          swarmID: swarmId ? swarmId : undefined,
          Env: envVariables ? envVariables : undefined
        }
      )
      core.info(`Successfully created new stack with name: ${stackName}`)
    }
  } catch (error) {
    core.info('⛔️ Something went wrong during deployment!')
    throw error
  } finally {
    core.info(`Logging out from Portainer instance...`)
    await portainerApi.logout()
  }
}
