# Ingestimator
Estimate the monthly ingest cost on New Relic One for APM, Infrastructure, Mobile, Browser, Logs, Metrics and Traces

> :warning: This project is under early development and the numbers are not yet validated. There are likely 
some fundamental inaccuracies in the reported data. Stay tuned.

New Relic introduced a new, simplified pricing model in 2020 that primarily charges based on _Data Ingest_ and 
_Users_. Data Ingest is priced at a fixed cost of 25c per month per Gigibyte (1,000,000,000 bytes) of ingested
data, as opposed to other pricing models which price on a combination of many meters, such as hosts, metrics, page views,
queries, etc.

For some, it is important to understand roughly how much the ingest cost of certain telemetry data types
cost when compared to legacy (host based) pricing models. This allows you to:

- make an apples to apples comparison of New Relic One telemetry pricing with other legacy pricing models
- estimate the additional cost of deploying New Relic more broadly (on more applications, hosts, etc.)
- estimate how many hosts of APM or Infrastrucutre you can monitor with New Relic's free tier (100 GB per month free)

Since every application and environment is unique, it's hard for New Relic to provide an accurate estimate
of ingest cost per host for your application and environment. That's where **Ingestimator** comes in.

**Ingestimator** looks at your own telemetry data and calculates the estimated monthly cost for APM,
Infrastructure, Mobile, Browser, Logs, etc. based on your own telemetry. Simply select an account and a time range and see the estimated results. 

Your selected is then extrapolated to a an estimated ingest rate for a (30 day) month to estimate the total ingest cost over a month.
We recommend you use Last 7 days to account for weekend seasonality, but if your ingest has changed
a lot recently due to the addition (or removal) of more telemetry sources - or
if you want a faster result - you can select a shorter timeframe.

## How it works
NRQL has a special function, `bytecountestimate()`, which estimates the number of bytes of data ingest New Relic
would record for the set of Event or Metric data queried. So for example, the following query would estimate
the ingested Log data amount data based on the last 7 days of ingested log data.

```
FROM Log SELECT bytecountestimate() SINCE 7 days ago
```

We can normalize this out to a rate of 1 month (in NRQL, `1 month` is 30 days) by tweaking the query like so:

```
FROM Log SELECT rate(bytecountestimate(), 1 month) SINCE 7 days ago
```

And we could add any `WHERE` or `FACET` to help segment the ingest rate:
```
FROM Log SELECT rate(bytecountestimate(), 1 month) WHERE level = 'debug' SINCE 7 days ago
```

## Metrics (APM and Otherwise)
When determining an apples-to-apples comparison of APM costs to host-based pricing models, we need 
to include the set of Metric data that is coming from our APM agents as part of the APM cost per host. We can see that metric data by querying:
```
FROM Metric select bytecountestimate() where newrelic.source = 'agent'
```

To calculate the full set of APM ingest, we add event and trace generated by APM or OpenTelemetry 
agents, such as `Transaction`, `TransactionError`, `Span`, etc.

**Infrastructure**: New Relic infrastructure agents report Infrastructure
telemetry as `Sample` events (e.g. `SystemSample`, `ProcessSample`, etc) which
allow for unlimited cardinality. So we don't have any "Metric" data to 
allocate to the cost of Infrastructure.

However, there are other sources of Metric Data that come from. For example, you can forward your prometheus metric data into New Relic
Telemetry Data Platform via our Metrics API. So we measure that separately.

## Disclaimers
This project is under early development and the numbers are not yet validated. There are likely some fundamental
inacuraices.

Even after some testing, this data is not going to precisely match the data ingest that New Relic bills on. 
You can see that precise data in your account by querying `NrConsumption` events or selecting **View your usage** in 
the global drop down menu at the top right of New Relic one. 

Note that the `NrConsumption` data, while precise, will unfortunately not break down with the same level of detail or organizwed as intuitively as the data reported by **Ingestimator**. That's why I wrote this app.