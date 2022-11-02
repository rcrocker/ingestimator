import React from "react"
import {Link, navigation, NrqlQuery} from 'nr1'

import {
  APM_EVENTS,
  APM_TRACE_EVENTS,
  BROWSER_EVENTS,
  ESTIMATED_INGEST_GB,
  INFRA_EVENTS, LOGS_EVENTS,
  METRIC_EVENTS,
  MOBILE_EVENTS
} from "../shared/constants"
import {estimatedCost, ingestRate} from "../shared/utils"
import {Loading} from "./Loading";

const LIMIT = 40
const CURATED_EVENT_TYPES = ['Public_APICall'].concat(APM_EVENTS, APM_TRACE_EVENTS, METRIC_EVENTS, BROWSER_EVENTS, MOBILE_EVENTS, INFRA_EVENTS, LOGS_EVENTS)

export default class OtherEventsTable extends React.PureComponent {
  state = { loading: true }

  async componentDidMount() {
    this.load()
  }

  async componentDidUpdate({ accountId, since }) {
    if (!accountId || !since) {
      this.setState({ loading: true })
    }
    else if (accountId != this.props.accountId || since != this.props.since) {
      await this.load()
    }
  }

  /**
   * This is a bit messy, really. We have to find the event types that aren't our curated events.
   * Then we need to query each one to find its usage. Maybe there's an easy way to do that?
   */
  async load() {
    this.setState({ loading: true, stage: "Finding events", percentDone: 0, eventUsage: {} })

    const { accountId, since } = this.props

    let percentDone = 0.01;
    let loadingPercentDone = 0.95;

    this.setState({
      stage: `Getting all event types`,
      percentDone: percentDone * 100
    });

    const eventTypesResults = await NrqlQuery.query({ accountId, query: "SHOW eventTypes", formatType: 'raw'})
    // const eventTypeCount = eventTypesResults.data.eventTypes
    const eventTypes = eventTypesResults.data.results[0].eventTypes
        .filter(e => !CURATED_EVENT_TYPES.includes(e))
        .filter(e => !(e.startsWith("Nr") || e.startsWith("NR") || e.startsWith("Log_")));
    console.log(eventTypes);
    const eventTypeCount = eventTypes.length || 0;
    let cardinalityResults = []
    if (eventTypeCount > 0) {
      // Load the state for each of the events, incrementing percentDone proportionally
      let perEventTypeIncrement = (loadingPercentDone - percentDone) / eventTypeCount
      this.resultsToAwait = []
      this.setLoadingEventState(eventTypes, perEventTypeIncrement, percentDone)
      eventTypes.forEach(eventType => {
        const usageCardinalityQuery = this.ingestQuery(eventType, since);
        this.resultsToAwait.push(this.getCardinalityResult(accountId, eventType, cardinalityResults, usageCardinalityQuery))
      })
      await Promise.all(this.resultsToAwait)
    }

    this.setState({stage: `Sorting ${eventTypeCount} results`, percentDone: Math.trunc(loadingPercentDone * 100)})

    const sortedResults = cardinalityResults.sort((b, a) => {
      if (a.gb_per_month === b.gb_per_month) {
        return a.cardinality - b.cardinality;
      } else {
        return a.gb_per_month - b.gb_per_month;
      }
    });

    this.setState({
      cardinalityResults: sortedResults || [],
      loading: false
    })
  }

  ingestQuery(eventType, since) {
    return `SELECT ${ESTIMATED_INGEST_GB} as 'gb_per_month', cardinality() as 'cardinality' FROM ${eventType} SINCE ${since}`
  }

  updateEventLoadedState() {
    const eventTypesLoaded = this.eventTypes.length - this.eventTypesToLoad.length;
    this.setState({
      stage: `Loading event details: ${eventTypesLoaded}/${this.eventTypes.length} event(s) loaded`,
      percentDone: Math.trunc(this.percentLoaded * 100)
    })
  }

  setLoadingEventState(eventTypes, perEventTypeIncrement, percentDone) {
    this.perEventTypeIncrement = perEventTypeIncrement;
    this.eventTypes = eventTypes;
    this.eventTypesToLoad = eventTypes.map(x => x)
    this.percentLoaded = percentDone;

    this.updateEventLoadedState();
  }

  didLoadEventType(eventType) {
    if (this.eventTypesToLoad.includes(eventType)) {
      const index = this.eventTypesToLoad.indexOf(eventType);
      this.eventTypesToLoad.splice(index, 1);
      this.percentLoaded += this.perEventTypeIncrement;

      this.updateEventLoadedState();
    }
    return eventType
  }


  getCardinalityResult(accountId, eventType, destination, usageCardinalityQuery) {
    return NrqlQuery.query({accountId, query: usageCardinalityQuery, format: 'raw'})
        .then(result => {
          const gb_per_month = result.data[0].data[0].gb_per_month;
          const cardinality = result.data[1].data[0].cardinality;
          destination.push({eventType: eventType, gb_per_month: gb_per_month, cardinality: cardinality});
          return eventType;
        }).then(eventType => this.didLoadEventType(eventType))
  }

  render() {
    const { loading, stage, percentDone } = this.state
    if (loading) return <Loading stage={stage} percentDone={percentDone}/>
    let cardinalityResults = this.state.cardinalityResults;
    const total = cardinalityResults.reduce((p, e) => p + e.gb_per_month, 0)

    if (cardinalityResults.length > LIMIT) {
      const otherTotal = cardinalityResults.slice(LIMIT).reduce((p, e) => {return {
        cardinality: p.cardinality + e.cardinality,
        gb_per_month: p.gb_per_month + e.gb_per_month
      }}, {cardinality: 0, gb_per_month: 0})
      cardinalityResults = cardinalityResults.slice(1, LIMIT);
      otherTotal.eventType = 'All other event types'
      cardinalityResults[LIMIT] = otherTotal
    }

    return <div className="applications-table">
      <h4>Top Other Events by Telemetry Ingest ({ingestRate(total)})</h4>
      <table >
        <thead>
          <tr>
            <th>Event type</th>
            <th className="right">Cardinality</th>
            <th className="right">Ingest</th>
            <th className="right">Cost</th>
          </tr>
        </thead>
        <tbody>
        {cardinalityResults.map(eventType => (
            <tr key={eventType.eventType}>
              <td>{eventType.eventType} </td>
              <td className="right">{eventType.cardinality.toLocaleString('en-US')} </td>
              <td className="right">{ingestRate(eventType.gb_per_month)}</td>
              <td className="right">{estimatedCost(eventType.gb_per_month)}</td>
            </tr>
        ))}
        </tbody>
      </table>
    </div>
  }
}

function AppLink({ entityGuid, appName }) {
  const url = navigation.getOpenStackedNerdletLocation({
    id: 'apm-ingestimator',
    urlState: {
      entityGuid,
      appName
    }

  })
  return <Link to={url}>
    {appName || entityGuid}
  </Link>
}
