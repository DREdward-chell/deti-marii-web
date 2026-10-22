import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../../shared/api/client'
import { admissionLabels, type VolunteerRole } from '../../shared/api/clearance'
import {
  getOpportunity,
  getOpportunityFilters,
  listOpportunities,
  opportunityRegularities,
  type OpportunityCard,
  type OpportunityDetail,
  type OpportunityPage,
} from '../../shared/api/opportunities'

export function OpportunityCatalog({
  onSessionExpired,
}: {
  onSessionExpired: () => void
}) {
  const [q, setQ] = useState('')
  const [regularity, setRegularity] = useState('')
  const [roleId, setRoleId] = useState('')
  const [filter, setFilter] = useState({
    q: '',
    regularity: '',
    roleId: '',
    page: 0,
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [data, setData] = useState<{
    roles: VolunteerRole[]
    page: OpportunityPage | null
    detail: OpportunityDetail | null
  } | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      getOpportunityFilters(controller.signal),
      selected
        ? getOpportunity(selected, controller.signal)
        : listOpportunities(filter, controller.signal),
    ])
      .then(([roles, result]) => {
        if (!controller.signal.aborted)
          setData({
            roles,
            page: 'items' in result ? result : null,
            detail: 'description' in result ? result : null,
          })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        controller.abort()
        setData(null)
        if (cause instanceof ApiError && cause.status === 401)
          onSessionExpired()
        else setError(errorMessage(cause))
      })
    return () => controller.abort()
  }, [filter, selected, reload, onSessionExpired])
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setData(null)
    setError('')
    setFilter({ q: q.trim(), regularity, roleId, page: 0 })
  }
  return (
    <section className="learning-workspace">
      <p className="eyebrow">Пространство волонтёра</p>
      <h1>Найти дело</h1>
      <p className="notice">
        Здесь можно познакомиться с возможностями помощи. Просмотр каталога и
        допуск к виду помощи не означают подтверждённое участие. Запись на
        участие появится позже.
      </p>
      <div className="learning-actions">
        {selected && (
          <button
            className="text-button"
            onClick={() => {
              setData(null)
              setError('')
              setSelected(null)
            }}
          >
            ← К возможностям
          </button>
        )}
        <button
          className="text-button"
          onClick={() => {
            setData(null)
            setError('')
            setReload((x) => x + 1)
          }}
        >
          Обновить возможности
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Загружаем возможности…</p>}
      {data && !selected && (
        <>
          <form className="opportunity-filters" onSubmit={search}>
            <label>
              Поиск возможностей
              <input
                value={q}
                maxLength={120}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <label>
              Формат помощи
              <select
                value={regularity}
                onChange={(e) => setRegularity(e.target.value)}
              >
                <option value="">Все форматы</option>
                {Object.entries(opportunityRegularities).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Вид помощи
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                <option value="">Все виды помощи</option>
                {data.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button" type="submit">
              Найти
            </button>
          </form>
          {data.page && (
            <>
              <p role="status">Найдено: {data.page.total}</p>
              {data.page.items.length ? (
                <div className="course-grid">
                  {data.page.items.map((item) => (
                    <article className="form-card" key={item.id}>
                      <OpportunityFacts item={item} />
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setData(null)
                          setError('')
                          setSelected(item.id)
                        }}
                      >
                        Подробнее: {item.title}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="notice">
                  По этим условиям возможностей пока нет. Попробуйте изменить
                  поиск или фильтры.
                </p>
              )}
              <div
                className="learning-actions"
                aria-label="Страницы возможностей"
              >
                <button
                  className="secondary-button"
                  disabled={data.page.page === 0}
                  onClick={() => {
                    setData(null)
                    setError('')
                    setFilter((x) => ({ ...x, page: Math.max(0, x.page - 1) }))
                  }}
                >
                  Предыдущая страница
                </button>
                <span>Страница {data.page.page + 1}</span>
                <button
                  className="secondary-button"
                  disabled={
                    (data.page.page + 1) * data.page.size >= data.page.total
                  }
                  onClick={() => {
                    setData(null)
                    setError('')
                    setFilter((x) => ({ ...x, page: x.page + 1 }))
                  }}
                >
                  Следующая страница
                </button>
              </div>
            </>
          )}
        </>
      )}
      {data?.detail && (
        <article className="form-card opportunity-detail">
          <OpportunityFacts item={data.detail} />
          <h3>О возможности</h3>
          <p className="lesson-body">{data.detail.description}</p>
          <h3>Условия и требования</h3>
          <p className="lesson-body">
            {data.detail.requirements ||
              'Дополнительные требования не указаны.'}
          </p>
          <h3>Подготовка и обучение</h3>
          <p className="lesson-body">
            {data.detail.training || 'Дополнительная подготовка не указана.'}
          </p>
          <p className="muted">
            Версия {data.detail.version} · Опубликовано{' '}
            {new Date(data.detail.publishedAt).toLocaleDateString('ru-RU')}
          </p>
        </article>
      )}
    </section>
  )
}
function OpportunityFacts({ item }: { item: OpportunityCard }) {
  return (
    <>
      {item.demo && (
        <p className="preview-label">Демонстрационная возможность</p>
      )}
      <h2>{item.title}</h2>
      <p className="lesson-body">{item.summary}</p>
      <dl className="opportunity-facts">
        <dt>Вид помощи</dt>
        <dd>{item.role.name}</dd>
        <dt>Формат</dt>
        <dd>{opportunityRegularities[item.regularity]}</dd>
        <dt>Где</dt>
        <dd>{item.location}</dd>
        <dt>Когда</dt>
        <dd>{item.schedule}</dd>
        <dt>Ваш допуск к виду помощи</dt>
        <dd>{admissionLabels[item.admissionStatus]}</dd>
      </dl>
    </>
  )
}
