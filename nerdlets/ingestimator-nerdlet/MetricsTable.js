import React from "react"
import { NrqlQuery, Spinner, Link, Icon, navigation } from 'nr1'

import { ESTIMATED_INGEST_GB, METRIC_EVENTS } from "../shared/constants"
import { estimatedCost, getResultValue, ingestRate } from "../shared/utils"

const LIMIT = 40


export default function MetricsTableLoader({ accountId, since }) {
  const query = `SELECT ${ESTIMATED_INGEST_GB}, cardinality() FROM ${METRIC_EVENTS} SINCE ${since} WHERE metricName not like 'newrelic.goldenmetrics.%' FACET metricName RAW LIMIT ${LIMIT}`
  return <NrqlQuery accountId={accountId} query={query} formatType="raw">
    {({ loading, data }) => {
      if (loading || !data) return <Spinner />
      return <MetricsTable rows={data.facets} />
    }}
  </NrqlQuery>
}


function MetricsTable({ rows }) {
  return <div className="applications-table">
    <h4>Top Metrics by Ingest</h4>
    <table >
      <thead>
        <tr>
          <th>Metric</th>
          <th>Cardinality</th>
          <th>GB/mo</th>
          <th>Cost/mo</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => <tr key={row.name}>
          <td>{row.name}</td>
          <td className="right">{getResultValue(row.results[1])}</td>
          <td className="right">{ingestRate(getResultValue(row.results[0]))}</td>
          <td className="right">{estimatedCost(getResultValue(row.results[0]))}</td>
        </tr>)}
      </tbody>
    </table>
  </div>

}