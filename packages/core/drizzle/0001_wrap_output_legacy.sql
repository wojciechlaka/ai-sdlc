-- Wrap legacy flat RefinementOutput rows into the AgentOutput discriminated union format.
-- Old format: { title, userStory, ... }  (no 'type' field)
-- New format: { type: 'refinement', result: { title, userStory, ... } }
UPDATE agent_runs
  SET output = json_object('type', 'refinement', 'result', json(output))
  WHERE output IS NOT NULL
    AND json_extract(output, '$.type') IS NULL;
