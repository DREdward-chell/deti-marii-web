import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/client'
import { addDays, dayKey } from '../calendar/model'
import {
  demoLessons,
  lessonProblems,
  newBlock,
  type LessonFields,
} from './lessons'
import { demoMembership } from './membership'
import { demoStaff } from './staffAccess'
import { demoStaffEvents, emptyEvent, eventProblems } from './staffEvents'

beforeEach(() => localStorage.clear())

const rejects = async (promise: Promise<unknown>, status: number) => {
  const error = await promise.catch((cause: unknown) => cause)
  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).status).toBe(status)
}

describe('membership (приём в команду)', () => {
  it('starts not accepted, accepts once and keeps history', async () => {
    const initial = await demoMembership.get('p1')
    expect(initial.current.fields.status).toBe('NOT_ACCEPTED')
    expect(initial.current.version).toBe(0)

    const accepted = await demoMembership.save(
      'p1',
      0,
      { status: 'ACCEPTED', message: '  Добро пожаловать  ' },
      'staff@example.test',
    )
    expect(accepted.current).toMatchObject({
      fields: { status: 'ACCEPTED', message: 'Добро пожаловать' },
      version: 1,
      actorEmail: 'staff@example.test',
    })
    expect(accepted.history).toHaveLength(1)

    // Точный повтор не создаёт новую ревизию, даже со старой версией.
    const repeat = await demoMembership.save(
      'p1',
      0,
      { status: 'ACCEPTED', message: 'Добро пожаловать' },
      'staff@example.test',
    )
    expect(repeat.current.version).toBe(1)
    expect(await demoMembership.statuses(['p1', 'p2'])).toEqual({
      p1: 'ACCEPTED',
      p2: 'NOT_ACCEPTED',
    })
  })

  it('rejects a stale version and a revoke without an explanation', async () => {
    await demoMembership.save('p1', 0, { status: 'ACCEPTED', message: '' }, 'a')
    await rejects(
      demoMembership.save('p1', 0, { status: 'PAUSED', message: 'Пауза' }, 'a'),
      409,
    )
    await rejects(
      demoMembership.save('p1', 1, { status: 'REVOKED', message: '  ' }, 'a'),
      400,
    )
    const revoked = await demoMembership.save(
      'p1',
      1,
      { status: 'REVOKED', message: 'Не вышло по времени' },
      'a',
    )
    expect(revoked.history.map((item) => item.fields.status)).toEqual([
      'REVOKED',
      'ACCEPTED',
    ])
  })
})

describe('staff events (мероприятия)', () => {
  it('validates the form', () => {
    const problems = eventProblems({
      ...emptyEvent(),
      title: ' ',
      location: '',
      start: '14:00',
      end: '13:00',
      capacity: 0,
    })
    expect(Object.keys(problems).sort()).toEqual([
      'capacity',
      'end',
      'location',
      'title',
    ])
  })

  it('creates a draft, publishes it and confirms only up to capacity', async () => {
    const draft = await demoStaffEvents.save(null, 0, {
      ...emptyEvent(addDays(dayKey(), 3)),
      title: 'Мастерская',
      location: 'Москва',
      capacity: 1,
    })
    expect(draft.status).toBe('DRAFT')
    await rejects(
      demoStaffEvents.decide(draft.id, draft.version, 'none', 'CONFIRMED'),
      409,
    )

    const published = await demoStaffEvents.setStatus(draft.id, 0, 'PUBLISHED')
    const seeded = (await demoStaffEvents.list()).find(
      (event) => event.title === 'Субботняя мастерская',
    )!
    // В демо-мероприятии 3 места: одно подтверждено, два отклика ждут.
    const [, second, third] = seeded.responses
    const afterSecond = await demoStaffEvents.decide(
      seeded.id,
      seeded.version,
      second.id,
      'CONFIRMED',
    )
    const full = await demoStaffEvents.decide(
      seeded.id,
      afterSecond.version,
      third.id,
      'CONFIRMED',
    )
    expect(full.responses.filter((r) => r.status === 'CONFIRMED')).toHaveLength(
      3,
    )
    await rejects(
      demoStaffEvents.save(seeded.id, full.version, { ...full, capacity: 2 }),
      409,
    )
    expect(published.status).toBe('PUBLISHED')
  })

  it('refuses to confirm beyond the places left', async () => {
    const seeded = (await demoStaffEvents.list()).find(
      (event) => event.title === 'Субботняя мастерская',
    )!
    const limited = await demoStaffEvents.save(seeded.id, seeded.version, {
      ...seeded,
      capacity: 1,
    })
    await rejects(
      demoStaffEvents.decide(
        limited.id,
        limited.version,
        limited.responses[1].id,
        'CONFIRMED',
      ),
      409,
    )
  })
})

describe('lessons (обучение)', () => {
  const choice = (): LessonFields => {
    const block = newBlock('CHOICE')
    if (block.type !== 'CHOICE') throw new Error('unexpected block')
    return {
      title: 'Если планы изменились',
      goal: 'Как предупредить о пропуске.',
      source: '',
      blocks: [
        {
          ...block,
          question: 'Вы заболели. Что сделаете?',
          options: [
            {
              text: 'Напишу координатору',
              correct: true,
              explanation: 'Верно.',
            },
            { text: 'Ничего', correct: false, explanation: '' },
          ],
        },
      ],
    }
  }

  it('lists what blocks publication', () => {
    expect(
      lessonProblems({ title: '', goal: '', source: '', blocks: [] }),
    ).toEqual([
      'Назовите урок.',
      'Опишите, что человек поймёт после урока.',
      'Добавьте хотя бы один блок.',
      'Добавьте интерактивный блок: карточки, порядок шагов или ситуацию.',
    ])
    expect(lessonProblems(choice())).toEqual([
      'Блок 1 (ситуация с выбором): добавьте объяснение к каждому варианту.',
    ])
  })

  it('publishes a complete lesson and marks later edits', async () => {
    const fields = choice()
    if (fields.blocks[0].type === 'CHOICE')
      fields.blocks[0].options[1].explanation = 'Участники будут ждать.'
    const draft = await demoLessons.save(null, 0, fields)
    const published = await demoLessons.publish(draft.id, draft.version)
    expect(published.status).toBe('PUBLISHED')

    const edited = await demoLessons.save(published.id, published.version, {
      ...fields,
      goal: 'Новая цель',
    })
    expect(edited.changedSincePublish).toBe(true)
    await rejects(demoLessons.publish(edited.id, published.version), 409)
  })

  it('refuses to publish an incomplete lesson', async () => {
    const draft = await demoLessons.save(null, 0, choice())
    await rejects(demoLessons.publish(draft.id, draft.version), 400)
  })
})

describe('staff access (сотрудники)', () => {
  it('grants by email, rejects duplicates and self-revoke', async () => {
    const staff = demoStaff('admin@example.test')
    const initial = await staff.list()
    await rejects(staff.grant('not-an-email', 'admin@example.test'), 400)
    const next = await staff.grant(' New@Example.test ', 'admin@example.test')
    expect(next.map((member) => member.email)).toContain('new@example.test')
    await rejects(staff.grant('new@example.test', 'admin@example.test'), 409)
    const self = initial.find(
      (member) => member.email === 'admin@example.test',
    )!
    await rejects(staff.revoke(self.id, 'admin@example.test'), 409)
  })
})
