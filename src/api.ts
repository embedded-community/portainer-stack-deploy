import axios from 'axios'

export type EnvVariables = Array<{
  name: string
  value: string
}>

type EndpointId = number

type StackData = {
  Id: number
  Name: string
  EndpointId: EndpointId
  Env: EnvVariables
}

type CreateStackParams = { type: number; method: string; endpointId: EndpointId }
type CreateStackBody = {
  name: string
  stackFileContent: string
  swarmID?: string
  Env?: EnvVariables
}
type UpdateStackParams = { endpointId: EndpointId }
type UpdateStackBody = {
  env: EnvVariables
  stackFileContent?: string
  prune: boolean
  pullImage: boolean
}

export class PortainerApi {
  private axiosInstance

  constructor(host: string) {
    this.axiosInstance = axios.create({
      baseURL: `${host}/api`
    })
  }

  async login({ username, password }: { username: string; password: string }): Promise<void> {
    const { data } = await this.axiosInstance.post<{ jwt: string }>('/auth', {
      username,
      password
    })
    this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${data.jwt}`
  }

  async logout(): Promise<void> {
    // https://github.com/portainer/portainer/issues/12457
    // await this.axiosInstance.post('/auth/logout')
    this.axiosInstance.defaults.headers.common['Authorization'] = ''
  }

  async getStacks(): Promise<StackData[]> {
    const { data } = await this.axiosInstance.get<StackData[]>('/stacks')
    return data
  }

  async createStack(params: CreateStackParams, body: CreateStackBody): Promise<void> {
    const path = body?.swarmID ? '/stacks/create/swarm/string' : '/stacks/create/standalone/string'
    await this.axiosInstance.post(path, body, { params })
  }

  async updateStack(id: number, params: UpdateStackParams, body: UpdateStackBody): Promise<void> {
    await this.axiosInstance.put(`/stacks/${id}`, body, { params })
  }
}
