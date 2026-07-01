-- Shared test helper, loaded before each test file (inside its rolled-back tx).
-- assert(cond, msg): raises if the condition is false. This is the whole assertion API.
create or replace function assert(cond boolean, msg text) returns void as $$
begin
  if cond is distinct from true then
    raise exception 'ASSERT FAILED: %', msg;
  end if;
end;
$$ language plpgsql;

-- assert_raises(sql, msg): passes only if running `sql` raises an error.
-- Use to prove a guard rejects a forbidden operation.
create or replace function assert_raises(stmt text, msg text) returns void as $$
begin
  begin
    execute stmt;
  exception when others then
    return; -- expected: the guard fired
  end;
  raise exception 'ASSERT FAILED (expected error): %', msg;
end;
$$ language plpgsql;
