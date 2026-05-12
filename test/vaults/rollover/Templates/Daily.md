<%* 
// E2E fixture: slow the Templater render so that rollover (also slowed by
// the test) writes its rolled-todos block first, and Templater's final
// write lands AFTER rollover — clobbering it. This reproduces the
// production race that issue #146 reported (a slow tp.web.daily_quote
// call making Templater's evaluation take >1s).
await new Promise((r) => setTimeout(r, 1000));
-%>
# <% tp.date.now("YYYY-MM-DD") %>

## Tasks

