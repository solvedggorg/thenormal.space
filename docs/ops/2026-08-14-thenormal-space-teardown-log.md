# thenormal.space teardown log

Date: 2026-08-14

```
DELETE workers domain thenormal.space (thenormal-space) -> http=200 null
DELETE workers domain api.thenormal.space (thenormal-space-api) -> http=200 null
DELETE workers domain auth.thenormal.space (thenormal-auth) -> http=200 null
DELETE workers domain admin2.thenormal.space (thenormal-auth-admin) -> http=200 null
DELETE workers domain shop.thenormal.space (thenormalspace-shop) -> http=200 null
DELETE workers domain stats.thenormal.space (thenormal-stats) -> http=200 null
DELETE workers domain admin1.thenormal.space (thenormalspace-shop-backend) -> http=200 null
DELETE worker thenormal-space -> http=200 true
DELETE worker thenormalspace-shop -> http=200 true
DELETE worker thenormal-space-api -> http=403 [{"code": 10064, "message": "Cannot delete this Worker as it is a consumer for a Queue. Remove it from the Queue's consumers first, then retry."}]
DELETE worker thenormal-auth-admin -> http=200 true
DELETE worker thenormal-auth -> http=200 true
DELETE worker thenormal-stats -> http=200 true
DELETE worker thenormal-stats-tail -> http=200 true
DELETE worker thenormalspace-shop-backend -> http=200 true
DELETE container thenormalspace-shop-backend-medusaserver -> http=200 true
DELETE queue thenormal-shop-events -> http=400 [{"code": 11005, "message": "Cannot delete queue 'thenormal-shop-events' that is still referenced by a binding in a Worker. Unbind queue 'thenormal-shop-events' from the Workers 'thenormal-space-api'; then try again."}]
DELETE d1 thenormal-auth -> http=200 true
DELETE d1 thenormal-list -> http=200 true
DELETE d1 thenormal-shop -> http=200 true
DELETE kv thenormal-stats -> http=200 true
DELETE kv thenormal-shop-cache -> http=200 true
DELETE kv thenormal-auth -> http=200 true
DELETE r2 custom domain media.thenormal.space -> http=200 true
S3 ListObjects -> http=200 xml_len=437
S3 DELETE object health.txt -> http=204
DELETE r2 bucket thenormal-shop-media -> http=200 true
DELETE hyperdrive thenormal-shop -> http=200 true
DELETE access app thenormal-auth-admin -> http=202 true
DELETE access app thenormal-shop-admin -> http=202 true
leftover workers -> http=200 ["thenormal-space-api"]
```

## Second pass

Queue `thenormal-shop-events` still referenced `thenormal-space-api`. Removed the consumer, then deleted the Worker, then the queue.

Leftover thenormal Workers: none  
Leftover thenormal queues: none  
Leftover thenormal D1 / KV / R2 / Hyperdrive / Access / containers: none
