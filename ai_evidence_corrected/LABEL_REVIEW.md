# Expected-answer review (before the final evaluation)

The supplied 50 inputs and expected answers are unchanged in dataset.json. The reported score is provisional until annotation rules are reviewed. Do not adjust answers after seeing a model response merely to improve accuracy. If labels or prompt change after pilot testing, document a new dataset/protocol version and evaluate separately.

Resolve at least these cases:
- 17: “O types” does not specify Rh status; expecting O+ assumes information absent from the query.
- 20: zero units describes available stock, whereas the task asks for requested quantity. Queries 12 and 30 already use null for available-stock quantities.
- 23, 33, 43: define handling of multiple blood groups. A single-group schema loses information; selecting the first group must be an explicit task rule.
- 16, 22: missing blood group is not necessarily a request for all groups. Define unknown versus All.
- 34: veterinary/out-of-scope request should have a documented rejection behavior, not automatically become a human-blood search.
- 36, 47: offered or returned units are not requested units; define direction/intent or narrow the dataset.
- 21, 24, 44, 45: urgency labels rely on contextual assumptions (NICU, being awake, quantity, ER). Define urgency as a text annotation rule, not a clinically validated triage recommendation.
- Prompt currently calls quantity a number although many expected answers use null. Explicitly document missing-value behavior in a revised protocol if needed.

Recommended process: review labels with a second annotator, resolve disagreements before the final run, retain the original dataset and record every revision. Consider a clarification/invalid flag or an array schema in a future app version, and evaluate that version separately.
