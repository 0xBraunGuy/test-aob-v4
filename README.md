# test-aob-v4

## Using

- `"@bonfida/aaob": "^0.1.3"`
- `agnostic-orderbook = {git = "https://github.com/Bonfida/agnostic-orderbook.git", features = ["lib", "utils"]}`

## Repro

- You'll need `anchor-client-gen` installed : <https://github.com/kklas/anchor-client-gen>

```bash
PROJECT_DIR='/code/test-aob-v4'
anchor build 
anchor-client-gen $PROJECT_DIR/target/idl/test_aob_v4.json $PROJECT_DIR/tests/generated/ --program-id Dgth76j3CNxmCgkSUVKZCvdgRCConmJkXkT6pgPqLSKs
tsc
anchor test
```

## Problem

- after placing 6 matching trades ($100, $90, $80), but before consuming any events, there are 3 fill and 3 out events:

```bash
eventQueue before 6
0 fill_event: 1584563250285305198614952716271615 100
1 out_event: 1584563250285305198614952716271615 0
2 fill_event: 1584563250285305198614952716271614 90
3 out_event: 1584563250285305198614952716271614 0
4 fill_event: 1584563250285305198614952716271613 80
5 out_event: 1584563250285305198614952716271613 0
```

- after consuming one event, the client side shows the event was processed from the bottom:

```bash
eventQueue after 5
0 fill_event: 1584563250285305198614952716271615 100
1 out_event: 1584563250285305198614952716271615 0
2 fill_event: 1584563250285305198614952716271614 90
3 out_event: 1584563250285305198614952716271614 0
4 fill_event: 1584563250285305198614952716271613 80

```

- but checking the event queue on the server side shows the event was correctly popped from the top:

```bash
'Program log:  0, out_event 1584563250285305198614952716271615, 0',
'Program log:  1, fill_event 1584563250285305198614952716271614, 90',
'Program log:  2, out_event 1584563250285305198614952716271614, 0',
'Program log:  3, fill_event 1584563250285305198614952716271613, 80',
'Program log:  4, out_event 1584563250285305198614952716271613, 0',
```
