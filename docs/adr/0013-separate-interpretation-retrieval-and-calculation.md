# Separate interpretation, retrieval, and calculation

The OpenAI model will transform free text into an Information Need Card and explain retrieved evidence, while application code queries the Evidence Snapshot and deterministic functions perform filtering and arithmetic. A result validator will reject unsupported factual claims; this separation keeps the AI useful for language and reasoning without allowing model memory or opaque arithmetic to become public evidence.
