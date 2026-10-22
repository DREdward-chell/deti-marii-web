import { get, isRecord, write } from './client'
import {
  admissionLabels,
  type AdmissionStatus,
  type VolunteerRole,
} from './clearance'

export const opportunityRegularities = {
  ONE_OFF: 'Разовая помощь',
  REGULAR: 'Регулярная помощь',
  FLEXIBLE: 'Гибкий формат',
} as const
export type OpportunityRegularity = keyof typeof opportunityRegularities
export interface OpportunityContent {
  title: string
  summary: string
  description: string
  roleId: string | null
  regularity: OpportunityRegularity
  location: string
  schedule: string
  requirements: string
  training: string
  demo: boolean
}
export interface OpportunityListItem {
  id: string
  title: string
  revision: number
  publishedVersion: number | null
  publishedRevision: number | null
}
export interface OpportunityDraft extends Omit<OpportunityListItem, 'title'> {
  content: OpportunityContent
}
export interface OpportunityCard {
  id: string
  title: string
  summary: string
  regularity: OpportunityRegularity
  location: string
  schedule: string
  role: VolunteerRole
  demo: boolean
  version: number
  admissionStatus: AdmissionStatus
}
export interface OpportunityDetail extends OpportunityCard {
  description: string
  requirements: string
  training: string
  publishedAt: string
}
export interface OpportunityPage {
  items: OpportunityCard[]
  total: number
  page: number
  size: number
}
function obj(v: unknown) {
  if (!isRecord(v)) throw new Error('Unexpected opportunity object')
  return v
}
function text(v: unknown): string {
  if (typeof v !== 'string') throw new Error('Unexpected opportunity text')
  return v
}
function num(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
    throw new Error('Unexpected opportunity number')
  return v
}
function bool(v: unknown): boolean {
  if (typeof v !== 'boolean') throw new Error('Unexpected opportunity flag')
  return v
}
function nullable<T>(v: unknown, parse: (v: unknown) => T): T | null {
  return v === null ? null : parse(v)
}
function list<T>(v: unknown, parse: (v: unknown) => T): T[] {
  if (!Array.isArray(v)) throw new Error('Unexpected opportunity list')
  return v.map(parse)
}
function kind<T extends string>(v: unknown, labels: Record<T, string>): T {
  if (typeof v !== 'string' || !Object.hasOwn(labels, v))
    throw new Error('Unexpected opportunity kind')
  return v as T
}
function role(v: unknown): VolunteerRole {
  const x = obj(v)
  return {
    id: text(x.id),
    name: text(x.name),
    description: text(x.description),
    version: num(x.version),
  }
}
function metadata(v: unknown) {
  const x = obj(v)
  return {
    id: text(x.id),
    revision: num(x.revision),
    publishedVersion: nullable(x.publishedVersion, num),
    publishedRevision: nullable(x.publishedRevision, num),
  }
}
function draft(v: unknown): OpportunityDraft {
  const x = obj(v)
  const c = obj(x.content)
  return {
    ...metadata(x),
    content: {
      title: text(c.title),
      summary: text(c.summary),
      description: text(c.description),
      roleId: nullable(c.roleId, text),
      regularity: kind(c.regularity, opportunityRegularities),
      location: text(c.location),
      schedule: text(c.schedule),
      requirements: text(c.requirements),
      training: text(c.training),
      demo: bool(c.demo),
    },
  }
}
function card(v: unknown): OpportunityCard {
  const x = obj(v)
  return {
    id: text(x.id),
    title: text(x.title),
    summary: text(x.summary),
    regularity: kind(x.regularity, opportunityRegularities),
    location: text(x.location),
    schedule: text(x.schedule),
    role: role(x.role),
    demo: bool(x.demo),
    version: num(x.version),
    admissionStatus: kind(x.admissionStatus, admissionLabels),
  }
}
const staff = '/coordination/opportunities'
export async function listOpportunityDrafts(signal?: AbortSignal) {
  return list(await get(staff, signal), (v): OpportunityListItem => ({
    ...metadata(v),
    title: text(obj(v).title),
  }))
}
export async function createOpportunity() {
  return draft(await write(staff, 'POST'))
}
export async function getOpportunityDraft(id: string, signal?: AbortSignal) {
  return draft(await get(`${staff}/${encodeURIComponent(id)}`, signal))
}
export async function saveOpportunity(
  current: OpportunityDraft,
  content: OpportunityContent,
) {
  return draft(
    await write(`${staff}/${encodeURIComponent(current.id)}`, 'PUT', {
      revision: current.revision,
      content,
    }),
  )
}
export async function publishOpportunity(current: OpportunityDraft) {
  return draft(
    await write(`${staff}/${encodeURIComponent(current.id)}/publish`, 'POST', {
      revision: current.revision,
    }),
  )
}
export async function withdrawOpportunity(current: OpportunityDraft) {
  return draft(
    await write(`${staff}/${encodeURIComponent(current.id)}/withdraw`, 'POST', {
      publishedVersion: current.publishedVersion,
    }),
  )
}
export async function listOpportunities(
  filter: { q: string; regularity: string; roleId: string; page: number },
  signal?: AbortSignal,
): Promise<OpportunityPage> {
  const params = new URLSearchParams({
    q: filter.q,
    page: String(filter.page),
    size: '20',
  })
  if (filter.regularity) params.set('regularity', filter.regularity)
  if (filter.roleId) params.set('roleId', filter.roleId)
  const x = obj(await get(`/opportunities?${params}`, signal))
  return {
    items: list(x.items, card),
    total: num(x.total),
    page: num(x.page),
    size: num(x.size),
  }
}
export async function getOpportunityFilters(signal?: AbortSignal) {
  return list(obj(await get('/opportunities/filters', signal)).roles, role)
}
export async function getOpportunity(
  id: string,
  signal?: AbortSignal,
): Promise<OpportunityDetail> {
  const x = obj(await get(`/opportunities/${encodeURIComponent(id)}`, signal))
  return {
    ...card(x),
    description: text(x.description),
    requirements: text(x.requirements),
    training: text(x.training),
    publishedAt: text(x.publishedAt),
  }
}
