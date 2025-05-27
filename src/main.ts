import * as core from '@actions/core'
import axios from 'axios'
import { deployStack, parseEnvVariables } from './deployStack'

export async function run(): Promise<void> {
  try {
    const portainerHost: string = core.getInput('portainer-host', {
      required: true
    })
    const username: string = core.getInput('username', {
      required: true
    })
    const password: string = core.getInput('password', {
      required: true
    })
    const swarmId: string = core.getInput('swarm-id', {
      required: false
    })
    const endpointId: string = core.getInput('endpoint-id', {
      required: false
    })
    const stackName: string = core.getInput('stack-name', {
      required: true
    })
    const stackDefinitionFile: string = core.getInput('stack-definition', {
      required: false
    })
    const templateVariables: string = core.getInput('template-variables', {
      required: false
    })
    const envVariables: string = core.getInput('env-variables', {
      required: false
    })
    const image: string = core.getInput('image', {
      required: false
    })
    const pruneStack: boolean = core.getBooleanInput('prune-stack', {
      required: false
    })
    const pullImage: boolean = core.getBooleanInput('pull-image', {
      required: false
    })

    await deployStack({
      portainerHost,
      username,
      password,
      swarmId,
      endpointId: parseInt(endpointId) || 1,
      stackName,
      stackDefinitionFile: stackDefinitionFile ?? undefined,
      templateVariables: templateVariables ? JSON.parse(templateVariables) : undefined,
      envVariables: envVariables ? parseEnvVariables(envVariables) : undefined,
      image,
      pruneStack: pruneStack || false,
      pullImage: pullImage || false
    })
    core.info('✅ Deployment done')
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const {
        status,
        data,
        config: { url, method }
      } = error.response
      return core.setFailed(
        `AxiosError HTTP Status ${status} (${method} ${url}): ${JSON.stringify(data, null, 2)}`
      )
    }
    return core.setFailed(error as Error)
  }
}

run()
