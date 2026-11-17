# Báo cáo reseed ma trận bản đồ 33 tỉnh (v3 — 2026-11-17)

- Thuật toán: seeded procedural (Perlin fBm đa octave + offset/xoay riêng theo mã tỉnh), nhóm hình thái thực tế, CBD anchor riêng, weighted zoning 7 vùng.
- Hà Nội (001): **không thay đổi** (bản đồ lõi lưu DB `map_nodes`).
- SQL: `scripts/out/reseed-province-maps.sql` (56781 ô giá đất) · Preview: `scripts/out/province-maps-preview.html`.

| Mã | Tỉnh/TP | Nhóm hình thái | Đất liền | Nước | CBD | Dân cư | Hành chính | CN | Ngoại ô | Xanh/Núi | Cảng | Hệ số giá |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 004 | Tỉnh Cao Bằng | Miền núi & cao nguyên | 94.9% | 5.1% | 11.4% | 27.4% | 13.1% | 18.0% | 16.6% | 13.4% | 0.0% | ×1.182 |
| 008 | Tỉnh Tuyên Quang | Miền núi & cao nguyên | 94.6% | 5.4% | 11.6% | 27.8% | 12.7% | 15.9% | 19.8% | 12.2% | 0.0% | ×1.188 |
| 011 | Tỉnh Điện Biên | Miền núi & cao nguyên | 94.0% | 6.0% | 11.8% | 28.1% | 12.7% | 18.5% | 16.3% | 12.6% | 0.0% | ×1.184 |
| 012 | Tỉnh Lai Châu | Miền núi & cao nguyên | 94.1% | 5.9% | 10.9% | 28.6% | 10.2% | 16.3% | 19.4% | 14.7% | 0.0% | ×1.182 |
| 014 | Tỉnh Sơn La | Miền núi & cao nguyên | 93.8% | 6.2% | 11.3% | 28.1% | 14.3% | 16.6% | 15.4% | 14.4% | 0.0% | ×1.191 |
| 015 | Tỉnh Lào Cai | Miền núi & cao nguyên | 93.5% | 6.5% | 11.2% | 29.2% | 13.1% | 17.6% | 18.5% | 10.3% | 0.0% | ×1.19 |
| 019 | Tỉnh Thái Nguyên | Đồng bằng nội địa | 93.0% | 7.0% | 12.3% | 27.8% | 14.7% | 16.8% | 16.4% | 12.1% | 0.0% | ×1.196 |
| 020 | Tỉnh Lạng Sơn | Miền núi & cao nguyên | 94.7% | 5.3% | 12.5% | 28.8% | 13.8% | 16.6% | 15.0% | 13.4% | 0.0% | ×1.195 |
| 022 | Tỉnh Quảng Ninh | Ven biển (Đông/ĐN) | 65.0% | 35.0% | 9.6% | 24.7% | 9.4% | 14.0% | 14.3% | 9.7% | 18.3% | ×1.191 |
| 024 | Tỉnh Bắc Ninh | Đồng bằng nội địa | 93.4% | 6.6% | 13.2% | 28.2% | 10.9% | 19.1% | 17.8% | 10.9% | 0.0% | ×1.188 |
| 025 | Tỉnh Phú Thọ | Đồng bằng nội địa | 94.2% | 5.8% | 14.8% | 26.5% | 11.2% | 17.5% | 16.2% | 13.8% | 0.0% | ×1.19 |
| 031 | Thành phố Hải Phòng | Ven biển (Đông/ĐN) | 66.8% | 33.2% | 9.2% | 22.0% | 9.8% | 15.1% | 15.3% | 10.6% | 18.1% | ×1.002 |
| 033 | Tỉnh Hưng Yên | Đồng bằng nội địa | 93.2% | 6.8% | 13.4% | 28.4% | 12.3% | 18.5% | 16.2% | 11.2% | 0.0% | ×1.005 |
| 037 | Tỉnh Ninh Bình | Ven biển (Đông/ĐN) | 69.8% | 30.2% | 11.5% | 23.4% | 10.7% | 15.2% | 12.6% | 10.4% | 16.3% | ×1.012 |
| 038 | Tỉnh Thanh Hóa | Ven biển (Đông/ĐN) | 63.5% | 36.5% | 11.0% | 23.7% | 11.4% | 14.7% | 13.8% | 9.6% | 15.8% | ×0.991 |
| 040 | Tỉnh Nghệ An | Ven biển (Đông/ĐN) | 68.0% | 32.0% | 9.5% | 24.1% | 10.0% | 13.8% | 15.5% | 8.1% | 19.0% | ×1.013 |
| 042 | Tỉnh Hà Tĩnh | Ven biển (Đông/ĐN) | 62.9% | 37.1% | 11.4% | 22.7% | 9.9% | 15.7% | 14.7% | 10.5% | 15.1% | ×1.016 |
| 044 | Tỉnh Quảng Trị | Ven biển (Đông/ĐN) | 65.6% | 34.4% | 10.4% | 23.7% | 9.5% | 13.6% | 13.9% | 10.8% | 18.2% | ×1.007 |
| 046 | Thành phố Huế | Ven biển (Đông/ĐN) | 67.4% | 32.6% | 9.5% | 22.6% | 11.1% | 15.4% | 15.1% | 10.9% | 15.5% | ×1.01 |
| 048 | Thành phố Đà Nẵng | Ven biển (Đông/ĐN) | 70.0% | 30.0% | 10.4% | 22.6% | 10.2% | 14.6% | 15.0% | 8.6% | 18.7% | ×1.001 |
| 051 | Tỉnh Quảng Ngãi | Ven biển (Đông/ĐN) | 66.6% | 33.4% | 10.3% | 23.0% | 12.5% | 14.1% | 14.6% | 10.2% | 15.3% | ×1.021 |
| 052 | Tỉnh Gia Lai | Miền núi & cao nguyên | 94.1% | 5.9% | 12.2% | 29.3% | 11.2% | 16.9% | 16.2% | 14.1% | 0.0% | ×1.02 |
| 056 | Tỉnh Khánh Hòa | Ven biển (Đông/ĐN) | 67.4% | 32.6% | 9.8% | 23.3% | 11.7% | 15.4% | 13.4% | 10.4% | 15.9% | ×1.013 |
| 066 | Tỉnh Đắk Lắk | Miền núi & cao nguyên | 94.6% | 5.4% | 14.1% | 29.6% | 11.7% | 15.4% | 18.1% | 11.0% | 0.0% | ×1.185 |
| 068 | Tỉnh Lâm Đồng | Miền núi & cao nguyên | 93.8% | 6.2% | 10.9% | 29.7% | 13.6% | 16.0% | 17.5% | 12.2% | 0.0% | ×1.195 |
| 075 | Tỉnh Đồng Nai | Đồng bằng nội địa | 94.3% | 5.7% | 12.6% | 29.1% | 13.6% | 17.4% | 16.0% | 11.4% | 0.0% | ×1.184 |
| 079 | Thành phố Hồ Chí Minh | Sông nước | 89.7% | 10.3% | 12.5% | 22.8% | 12.2% | 16.6% | 15.7% | 10.6% | 9.7% | ×1.202 |
| 080 | Tỉnh Tây Ninh | Đồng bằng nội địa | 94.2% | 5.8% | 13.6% | 26.9% | 11.6% | 18.9% | 17.4% | 11.6% | 0.0% | ×1.201 |
| 082 | Tỉnh Đồng Tháp | Sông nước | 90.6% | 9.4% | 10.6% | 28.5% | 11.7% | 15.9% | 14.5% | 10.0% | 8.8% | ×1.204 |
| 086 | Tỉnh Vĩnh Long | Sông nước | 90.1% | 9.9% | 13.3% | 27.4% | 11.0% | 15.5% | 14.7% | 11.3% | 6.7% | ×1.21 |
| 091 | Tỉnh An Giang | Ven biển (Tây/TN) | 63.5% | 36.5% | 10.6% | 25.2% | 10.9% | 14.3% | 15.2% | 8.9% | 14.9% | ×1.209 |
| 092 | Thành phố Cần Thơ | Sông nước | 88.5% | 11.5% | 12.8% | 26.9% | 10.0% | 15.8% | 14.5% | 12.3% | 7.6% | ×1.207 |
| 096 | Tỉnh Cà Mau | Ven biển (Tây/TN) | 62.4% | 37.6% | 11.6% | 23.1% | 11.6% | 14.2% | 15.9% | 8.9% | 14.8% | ×1.213 |

## Mẫu trực quan (ASCII) — Tỉnh Lào Cai (015)
```
    |         |         |         |         |         
 0  ....IIIIIIIIIIIIIIIIIIII..~.......................
 1  ...IIIIIIIIIIIIIIIIIIIII.....................ssss.
 2  ..IIIIIIIIIIIIIIIIIIIIIII~..................ssssss
 3  ..IIIIIIIIIIIIIIIIIIIIIII.................ssssssss
 4  ..IIIIIIIIIIIIIIIIIIIIII~^^^............ssssssssss
 5  .IIIIIIIIIIIIIIIIIIIIIIII^^^^..........sssssssssss
 6  ..IIIIIIIIIIIIIIIIIIIIII~^^^..........ssssssssssss
 7  ..IIIIIIIIIIIIIIIIIIIII~I^...........sssssssssssss
 8  ...IIIIIIIIIIIIIIIIIIIIII^^.........ssssssssssssss
 9  ...IIIIIIIIIIIIIIIIIIIII^^^^^^.....s^^ssssssssssss
10  ...IIIIIIIIIIIIIIIIIIIIIAAAAA^^....^^^^sssssssssss
11  ...sIIIIIIIIIIIIIIIIAAAAAAAAAAAAA^.^^s^sssssssssss
12  ...ssIIIIIIIIIIIIIIAA~AAAAAAA~AAAAA^^^^^ssssssssss
13  ...sssIIIIIIIIIIIIAAAAAAAAA~~~~~AAAA^^^^^sssssssss
14  ...sss^IIIIIIIIIIAAAAAAAC~~~~C~~~AAAA^^^^^ssssssss
15  ....ss^^IIIIIIIIAAAAACCCC~~~CCCA~~AAA^^^^^^sssssss
16  ....sssssIIIIIIIAAAACCCC~~CCCCCCA~~AAA^^^^^^ssssss
17  .....ssssssIIIIAAAAACCC~~CCCCCCCCA~~AA^^^^^^ssssss
18  ......sssssssIAAAAACCC~~CCCCC~CCCAA~AAA^^^^^^sssss
19  ......ssssssssAAAACCC~~CCCCCC~CCCCAA~AA^^^^^^^ssss
20  ......ssssssss~~~ACC~~CCCCCC~CCCCCCA~~A^^^^^^^ssss
21  ~.......sss~~~~~~~~~~CCCCCCC~CCCCCCAA~~~~^^^^^ssss
22  ~~.......~~~~~AAA~~~CCCCCCCCCCCCCCCAAA~~~~~~~~~~~s
23  .~~..^..~~~^..AAAAACCCCCCCCCCCCCCCCAAAA.s~~~~~~~~~
24  ..~~~.~~~.....AAAACCCCCCCCCCCCCCCCCAAAA..^sssssss~
25  ...~~~~~.......AAACCCCCCCCCCCCCCCCCAAAA^^^......ss
26  .....~.........AAACCCCCCCCC~CCCCCCCAAA^^^^........
27  ...............AAAACCCCCCCCCCCCCCCAAAA^^^^^.......
28  ................AAAAACCCCC~CCCCCCAAAAAs^^^........
29  ................AAAAAAAC~CCCCCCAAAAAA^^^^ss.......
30  .................AAAAAAAACCCCAAAAAAAA^^^^sss......
31  ................^^AAAAAAAAAAAAAAAAAA^^^^sssss.....
32  ..............^...^A~AAAAAAAAAAAAA^^^^^^^sssss....
33  ..................^^^^AAAAAAAAAAssssssssssssss....
34  .................^^^^^^^^AAAA^sssssssssssssssss...
35  ..................^^^^^~^^^^^^^ssssssssssssssss..~
36  ...................^^^^^~^^^^^^ssssssssssssssss.~~
37  ...................^^^^^^^^^^^ss^^^ssssssssssss~~~

```

## Mẫu trực quan (ASCII) — Tỉnh Bắc Ninh (024)
```
    |         |         |         |         |         
 0  IIIIIIIIIIIIIIIIIIIIIIIIIIIII~IIIII...............
 1  IIIIIIIIIIIIIIIIIIIIIIIIIIIII~IIIII...............
 2  IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII................
 3  .IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII................
 4  IIIIIIIIIIIIIIIIIIIIIIIIIII~IIIIII....ssssssssss..
 5  .IIIIIIIIIIIIIAAAAAAAAIIII~IIIIIII...^^^^^^^sssss.
 6  .IIIIIIIIIIIAAAAAAIIAAAAAAIIIIIIII.s^^^^^^^^^sssss
 7  .IIIIIIIIIIAAAAIIIIIIIA~AAAIIIIII.s^^^^^^^^^^^^sss
 8  .IIIIIIIIIAAAAIIIIIIIIIIAAAAIIIIIs^^^^^^^^^^^^^sss
 9  ..IIIIIIIAAAIIIIIIIIII~IIAAAIIIIss^^^^^^^^^^^^^sss
10  ...IIIIIIAAIIIIICCCCIIC~IIAAAIIIss^^^^^^^^^^^^^^ss
11  sss.IIIIAAIIIIICCCCCCCC~IIIAAI..sss^^^^^^^^^^^^^ss
12  sssssIIIAIIIICCCCCCCCCCC~IIAA...sss^^^^~~~^^^^^^ss
13  ssssssIAAIIICCCCCCCCCCC~IIIIAA..ssss^^~~~~~^^^^^ss
14  ssssssAAAIICCCCCCCCCCCC~IIIIAA.sssss^~~^^^~~^^^sss
15  s~~~~AAAAsICCCCCCCCCCC~CCI..AA.sssss~~^^^^^~^^ssss
16  ~~~~~~AAsssCCCCCCCCCCC~CC...AA.ssss~~sss^^^^~sssss
17  ~ssAA~~ssss.CCCCCCCCCC~CC^^^AAsss~~~ssssssss~~ssss
18  ssAAAs~~ssssCCCCCCCCCCC~^^~~~~~~~~~ssssssssss~~sss
19  sAAAsss~~CCCCCCCCCCCCCC^~~~~~~~~~sssssssssssss~sss
20  AAAsssss~~CCCCCCCCCCCCC~~~~^A^^^^ssssssssssssss~ss
21  AAAsssCCC~~CCCCCCCCCC~~~^^^AA^^^^ssssssssssssss~~s
22  AAAssCCCCC~~CCCCCCCCC~~^^AAAA^^^^.ssssssssssssss~~
23  AAsssCCCCCC~~CCCC..~~^^^^AAA^^^^^^.ssssssssssssss~
24  AAsssCCCCCCC~~CCC.~~~^^AAAAA^~^^^^.ssssssssssssss.
25  AAsssCCCCCCCC~~~C~~..^AAAAA^^^^^^...ssssssssssss..
26  AAsssCCCCCCCCC~~~~...AAAAA^^^^^^^.....sssssssss...
27  AAssssCCCCCCCCCC~....AAA^^^~^^^^...........ss.....
28  AAssssCCCCCCCCCCC....AAA^^~^^^^^..................
29  AAAsssCCCCCCCCCC....AAA..^^^^^^...................
30  sAAssssCCCCCCCCC....AAA..~.^^.....................
31  sAAAssssCCCCCC.....AAA...~........................
32  ssAAAss...........AAA....~........................
33  sssAAA...........AAA.....~........................
34  ....AAA.......AAAAA.....~.........................
35  .....AAAA...AAAAAA................................
36  ........AAAAAAAAA......~..........................
37  ............AA........~...........................

```

## Mẫu trực quan (ASCII) — Thành phố Hải Phòng (031)
```
    |         |         |         |         |         
 0  ssIIIIIIIIIIIIIIIIIIIIIII~sssss~~~~~~~~~~~~~~~~~~~
 1  ssIIIIIIIIIIIIIIIIIIIIIIIsssssss~~~~~~~~~~~~~~~~~~
 2  sssIIIIIIIIIIIIIIIIIIIIIIIssssss~~~~~~~~~~~~~~~~~~
 3  sssIIIIIIIIIIIIIIIIIIIII~ssssssss~~~~~~~~~~~~~~~~~
 4  sssIIIIIIIIIIIIIIIIIIIIIIsssssssss~~~~~~~~~~~~~~~~
 5  ssssIIIIIIIIIIIIIIIIIIII~ssssssssss~~~~~~~~~~~~~~~
 6  ssssIIIIIIIIIIIIIIIAAAAA~ssss^^^^^^^~~~~~~~~~~~~~~
 7  sssssIIIIIIIIIIIIAAAAAAAAAAs^^^^^^^^^^~~~~~~~~~~~~
 8  sssssIIIIIIIIIIIAAAAII...sAA^^^^^^^^^^~~~~~~~~~~~~
 9  ssssssIIIIIIIIIAAAAII.....sAA^^PP^^^^^^~~~~~~~~~~~
10  ssssssAAAAAAAAIAAAII...~..PPAAPPPPP^^^^~~~~~~~~~~~
11  ssssssssssIIIAAAAII...~CCPPPPAPPPPPP^^^^~~~~~~~~~~
12  sssssssssssss.AA...CCCCCCCCPPPAPPPPPPPP^~~~~~~~~~~
13  sssssssssssss......CCCCCCCCCPPAPPPPPPPPP~~~~~~~~~~
14  sssssssssssss.....CC~CCCCCCPPPAPPPPPPPPP~~~~~~~~~~
15  sAssssCCCCCss.....CCCCCCCCCPPPPPPPPPPPPP~~~~~~~~~~
16  sAsssCCCCCCCC.....CC~CCCCCCPPPAPPPPPPPPP~~~~~~~~~~
17  sAsssCCCCCCCC.....CCC~CCCCPPPPAPPPPPPPP~~~~~~~~~~~
18  AAssssCCCCCCC.....PCCCCCCCPPPPAPPPPPPP~~~~~~~~~~~~
19  AAssssCCCCCCCC....PPCCCCCCPPPAAPPPPPP~~~~~~~~~~~~~
20  sAAsssCCCCCCCC....PPPPPPP~PPAAPPPPPP~~~~~~~~~~~~~~
21  sAAsssssCCCCC....APPPPPPPP~AAAPPPPP~~~~~~~~~~~~~~~
22  sAAAsssssCCCC...AAAAAPAAAAAAAPPPP~~~~~~~~~~~~~~~~~
23  sAAAAssssss.....A.AAAAAAAAAA~PPP~~~~~~~~~~~~~~~~~~
24  ssAAAss........A.^PPAAAAAAPPP~P~~~~~~~~~~~~~~~~~~~
25  ...AAAA.........^^PPPPPPPPPPP~~~~~~~~~~~~~~~~~~~~~
26  .....AAAAAAAA.^^^^PPPPPPPPPPP~~~~~~~~~~~~~~~~~~~~~
27  ..............^^^^PPPPPPPPPPP~~~~~~~~~~~~~~~~~~~~~
28  .............^^^^^^PPPPPPPPP~~~~~~~~~~~~~~~~~~~~~~
29  ..............^^^^^^PPPPPPPP~~~~~~~~~~~~~~~~~~~~~~
30  ..............^^^^^^PPPPPPP~~~~~~~~~~~~~~~~~~~~~~~
31  ..............^^^^^^^PPPPPP~~~~~~~~~~~~~~~~~~~~~~~
32  ..............^^^^^^^^PPPPPP~~~~~~~~~~~~~~~~~~~~~~
33  ..............^^^^^^^^^^^P~PP~~~~~~~~~~~~~~~~~~~~~
34  ...............^^^^^^^^^^^~PPP~~~~~~~~~~~~~~~~~~~~
35  ................^^^^^^^^^^^...~~~~~~~~~~~~~~~~~~~~
36  .................^^^^^^^^^.~...~~~~~~~~~~~~~~~~~~~
37  ...................^^^^.........~~~~~~~~~~~~~~~~~~

```

## Mẫu trực quan (ASCII) — Tỉnh Cà Mau (096)
```
    |         |         |         |         |         
 0  ~~~~~~~~~~~~~~~~~~~~~ssssssssssssssssss...........
 1  ~~~~~~~~~~~~~~~~~~~~~Psssssssssssssssss...........
 2  ~~~~~~~~~~~~~~~~~~~~PPPPPPsssssssssssss.....IIII..
 3  ~~~~~~~~~~~~~~~~~~~~PPPPPPPsssssssssssss..IIIIIIII
 4  ~~~~~~~~~~~~~~~~~~~PPPPPPPPPssssssssssss.IIIIIIIII
 5  ~~~~~~~~~~~~~~~~~~PPPPPPPPPPsssssssssss.IIIIIIIIII
 6  ~~~~~~~~~~~~~~~~~PPPPPPPPPPPPssssssssss.IIIIIIIIII
 7  ~~~~~~~~~~~~~~~~PPPPPPPPPPPPPssssss^^^^IIIIIIIIIII
 8  ~~~~~~~~~~~~~~~PPPPPPPPPPPPPPssss^^^^^^IIIIIIIIIII
 9  ~~~~~~~~~~~~~~PPPPPPPPPPPPPPPPss^^^^^^^IIIIIIIIIII
10  ~~~~~~~~~~~~~~PPPPPPPPPPPPPPPPss^^^^^^^^IIIIIIIIII
11  ~~~~~~~~~~~~~~PPPPPPPPPPPPPPPPs^^^^^^^^^IIIIIIIIII
12  ~~~~~~~~~~~~~~PPPPPPPPPPPPPPPsAAAAA^^^^^^IIIIIIIII
13  ~~~~~~~~~~~~~~PPPPPPPPPPPPPPAAAAAAAAA^^^^^IIIIIIII
14  ~~~~~~~~~~~~~~sPPPPPPPPPPPPAAAAAAAAAAA^^^^^IIIIIII
15  ~~~~~~~~~~~~~~sPPPPPPPPPPP~AAsss^^^AAAA^^^....III.
16  ~~~~~~~~~~~~~~sss^PPPP~~~AA~~CCCCC^^^AAA^.........
17  ~~~~~~~~~~~~~~~^^^^^^sssAAssCCCCCCCC^^^AA.........
18  ~~~~~~~~~~~~~~~^^^^^^^ssAAsCCC~CCCCCC...A.........
19  ~~~~~~~~~~~~~~~~~~^^I^^AAsCCCCCCCCCCCC..AA........
20  ~~~~~~~~~~~~~~~~^IIIIIIAAsCCCCCCCC~~CCC~~A........
21  ~~~~~~~~~~~~~~~~~IIIIIIAA.CCCCCCCCCC~~CCAA...~.~..
22  ~~~~~~~~~~~~~~~~~IIIIIIAAICCCCCCCCCCCCC.AA........
23  ~~~~~~~~~~~~~~~~~~IIIIIAAICCCCCCCCCCCCC.AA........
24  ~~~~~~~~~~~~~~~~~~~IIIIAAICCCCCCCCCCCC..AA........
25  ~~~~~~~~~~~~~~~~~~~~IIIAAACCCCCCCCCCC..AAA........
26  ~~~~~~~~~~~~~~~~~~~~~IIAAACCCCCCCCCCC..AAA........
27  ~~~~~~~~~~~~~~~~~~~~~IIAAAACCCCCCCCC..AAA.........
28  ~~~~~~~~~~~~~~~~~~~~~~IIAAAACCCCCCC..AAAA.........
29  ~~~~~~~~~~~~~~~~~~~~~~IIAAAAAACCCCAAAAAA..........
30  ~~~~~~~~~~~~~~~~~~~~~~~IIIAAAAAAAAAAAAA...........
31  ~~~~~~~~~~~~~~~~~~~~~~~II^^AAAAAAAAAAA............
32  ~~~~~~~~~~~~~~~~~~~~~~~^^^^^^AAAAAAAA.............
33  ~~~~~~~~~~~~~~~~~~~~~~~^^^^^^ssssssss.............
34  ~~~~~~~~~~~~~~~~~~~~~~^^^^^^^ssssssss.............
35  ~~~~~~~~~~~~~~~~~~~~~~ss^^^ssssssssss.............
36  ~~~~~~~~~~~~~~~~~~~~~~sssssssssssssss.............
37  ~~~~~~~~~~~~~~~~~~~~~sssssssssssssssss............

```

## Mẫu trực quan (ASCII) — Thành phố Cần Thơ (092)
```
    |         |         |         |         |         
 0  ................IIIIIII~~I~IIIIIIIIIIIIIIIIIIII~~~
 1  ................IIIIIIII~~IIIIIIIIIIIIIIIIIIIIII~~
 2  ...............^IIIIIIIIA~AAAAIIIIIIIIIIIIIIIIIIs~
 3  .............^^IIIIIIAAAA~AAAAAAIIIIIIIIIIIIIIII^s
 4  ...........^^^^IIIIAAIIIIP~PAAAAAIIIIIIIIIIIIIII^^
 5  ..........^^^^^IIAAAIIIIIIPIP~AAAAIIIIIIIIIIIIII^^
 6  .........^^^^^^IAAAIPIIIIIIIIP~PAAAIIIIIIIIIIIII^^
 7  ........^^^^^^^IAAIP~PICCCIIIIP~PAAAIIIIIIIIIIII^^
 8  ........^^^^^^^AAIIIP~CCCCCCCIPP~AAAIIIIIIIIIIII^^
 9  .......^^^^^^^^AAIIICCCCCCCCCC~P~PAAAAAAIIIIIIII^^
10  .......^^^^^^^AAIIIICCCC~CC~CCC~PIAAAAAAAAIIIII^^^
11  .......^^^^^^^AA^IIICCCCC~CCCCCCIIIIIIAAAAAAIII^^^
12  .......^^^^^^^AA^IICC~CCC~CCC~CCIIIIPPPIIAA~~~^^^^
13  .......^^^^^^^AA^IICCCCCCCCC~CCCIIIP~~~CP~~~~~~~^^
14  ....~..^^^^^^^AA^^ICCCCCCC~CCCCCCCC~CCCC~~~IAA~~~^
15  .......^^^^P^^AA^^IICC~CC~CCCCCCCC~CCCC~~CII^AA^~~
16  ~~~~~.~.^^P~PPAAA^^PICCCCCCCCC~CC~CCCC~~CCI^^^A^^~
17  ~~~~~~~~~~~~P~~AA^P~PC~~~CCCCP~~CCCC~~~CCC^^^^A~^^
18  .....~~~^^PPP~PAAA^P^IP~~C~~~~~CCCC~~~CC~~C^^^~^^^
19  ......~~~^^^^P~PAA^^^^IP~PP~~~~~~~~~CC~~CCC^^^^^^^
20  .....~..~~P^^^PPAAAA^^^P~P~~~~~~~~~CC~CCCC~C^^^^^^
21  .........~~P^^P~PAAAA^P~~~~~PPCCCCCC~CCCCCCC^^^A^^
22  .........P~~P^^PP^AAAAA~~~PAP~CCCCC~CCCCCCCC^^A^~^
23  ~~~.......P~~PPP~P^^AA~~AAAAP~~CC~CCCCCCCCC^^^A~^s
24  ...........P~~~PP~PP~~~~AAAA^PP~~~CCCCCCCC^^~^A^ss
25  ............P~~~~~~~~~P~P^AAAsPCCCCCCCCCC^^^^Assss
26  .............PP~~~~~P~~P^^AAAA~PssCCCCCCC^^^AAssss
27  ...............PPPP~~~PsPssAAAPssssCCCC^^sssAsssss
28  ...................PPPsP~PPssAAssssssCCsssAAssssss
29  ..................P~PssPPP~PPsAAAAsssssAAAAsssssss
30  ...................PssP~PsPP~PsAAAAAAAAAAAssssssss
31  ....................sssPssssPPssssAAAAAAssssssssss
32  .....................PsssssPP~Psssssssssssssssssss
33  ....................P~PPssP~PPssssssssssssssssssss
34  ...................P~PP~PP~Pssssssssssssssssssssss
35  ......................ss~sPsssssssssssssssssssssss
36  ......................ssssssssssssssssssssssssssss
37  .......................s~ss~ssssssssssssssssssssss

```

## ✓ Tỉ lệ phân khu
- Toàn bộ 33 tỉnh nằm trong cửa sổ chuẩn (CBD 10–15%, dân cư 25–30%, hành chính 10–15%, CN 15–20%, ngoại ô 15–20%, xanh/núi 10–15%, cảng 15–25% tỉnh biển / cảng sông nhỏ, sông nội địa 5–8%).