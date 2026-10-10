# Gap survey, Germany (2026-10-10)

`npx tsx cli/gap-survey.ts --sizes 30,40,50 --seeds 3 --iterations 1500 --verify 3`
(r_eff 1.5 mm, board 600 × 800 mm, margin 30 mm, towns ≥ 5000 inhabitants, minimum distance
25 mm). Each line: run time, level-2 evaluations, archive size, and for the top three archive
candidates "search value → exact string gap" with verification time, difficulty D and
recognisability R. Run with the code of commit 05ea94b (linear difficulty score capped at 1,
level 2 for every accepted candidate).

```text
max-gap  n=30 seed 1: 108 s, L2 440, archive 30 | 43.79→43.79 mm (exact, 9 s, D 0.06, R 0.25); 42.68→42.68 mm (exact, 9 s, D 0.45, R 0.26); 43.54→43.41 mm (exact, 6 s, D 0.23, R 0.44)
max-gap  n=30 seed 2: 73 s, L2 469, archive 30 | 43.80→43.24 mm (exact, 6 s, D 0.11, R 0.29); 42.36→42.36 mm (exact, 5 s, D 0.33, R 0.27); 42.84→42.84 mm (exact, 5 s, D 0.17, R 0.25)
max-gap  n=30 seed 3: 137 s, L2 451, archive 30 | 42.42→42.42 mm (exact, 6 s, D 0.18, R 0.26); 41.69→41.69 mm (exact, 17 s, D 0.43, R 0.24); 42.42→42.42 mm (exact, 12 s, D 0.51, R 0.24)
max-gap  n=40 seed 1: 404 s, L2 377, archive 30 | 43.02→43.02 mm (exact, 31 s, D 0.39, R 0.28); 40.77→40.77 mm (exact, 33 s, D 0.49, R 0.26); 44.13→44.13 mm (exact, 36 s, D 0.49, R 0.27)
max-gap  n=40 seed 2: 581 s, L2 400, archive 30 | 40.12→40.12 mm (exact, 25 s, D 0.53, R 0.30); 40.12→40.12 mm (exact, 37 s, D 0.42, R 0.26); 40.51→40.51 mm (exact, 45 s, D 0.50, R 0.25)
max-gap  n=40 seed 3: 262 s, L2 416, archive 30 | 40.80→40.80 mm (exact, 15 s, D 0.69, R 0.24); 40.80→40.80 mm (exact, 19 s, D 0.69, R 0.22); 41.23→41.23 mm (exact, 16 s, D 0.35, R 0.22)
max-gap  n=50 seed 1: 345 s, L2 362, archive 30 | 40.60→40.60 mm (exact, 26 s, D 0.74, R 0.20); 40.94→40.94 mm (exact, 26 s, D 0.58, R 0.23); 41.46→41.46 mm (exact, 35 s, D 0.24, R 0.21)
max-gap  n=50 seed 2: 216 s, L2 397, archive 30 | 41.37→41.37 mm (exact, 52 s, D 0.60, R 0.20); 41.37→41.37 mm (exact, 39 s, D 0.70, R 0.23); 41.37→41.37 mm (exact, 50 s, D 0.73, R 0.23)
max-gap  n=50 seed 3: 234 s, L2 337, archive 30 | 40.13→40.13 mm (exact, 21 s, D 0.24, R 0.16); 40.25→40.25 mm (exact, 54 s, D 0.35, R 0.18); 40.13→40.13 mm (exact, 35 s, D 0.27, R 0.18)
default  n=30 seed 1: 83 s, L2 344, archive 30 | 6.11→6.11 mm (exact, 1 s, D 1.00, R 0.40); 8.29→8.29 mm (exact, 2 s, D 1.00, R 0.38); 20.83→20.83 mm (exact, 2 s, D 1.00, R 0.38)
         best: Bremen, Henstedt-Ulzburg, Buchholz in der Nordheide, Lehre, Goslar, Weimar, Neustadt an der Orla, Stein, Manching, Traunstein, München, Schwabmünchen, Memmingen, Stuttgart, Freiburg im Breisgau, Lahr/Schwarzwald, Baden-Baden, Karlsruhe, Kaiserslautern, Frankfurt am Main, Weilburg, Leverkusen, Aachen, Krefeld, Bochum, Raesfeld, Lingen (Ems), Lippstadt, Detmold, Wunstorf
default  n=30 seed 2: 74 s, L2 299, archive 30 | 18.18→18.18 mm (exact, 2 s, D 1.00, R 0.44); 14.87→14.87 mm (exact, 3 s, D 1.00, R 0.33); 15.35→15.35 mm (exact, 2 s, D 1.00, R 0.33)
         best: Berlin, Halle (Saale), Leipzig, Chemnitz, Zwickau, Jena, Sömmerda, Bleicherode, Eisenach, Wasungen, Fürth, Roding, München, Lörrach, Bietigheim-Bissingen, Mannheim, Kaiserslautern, Trier, Koblenz, Solingen, Herdecke, Essen, Kleve, Osnabrück, Bremen, Munster, Lüneburg, Ahrensburg, Bredstedt, Rostock
default  n=30 seed 3: 108 s, L2 388, archive 30 | 9.17→9.17 mm (exact, 3 s, D 1.00, R 0.42); 8.84→8.84 mm (exact, 2 s, D 1.00, R 0.41); 6.84→6.84 mm (exact, 1 s, D 1.00, R 0.38)
         best: Pforzheim, Stuttgart, Reutlingen, Lauchringen, Singen (Hohentwiel), München, Saaldorf-Surheim, Ingolstadt, Nürnberg, Ilmenau, Erfurt, Jena, Annaberg-Buchholz, Zittau, Senftenberg, Leipzig, Königslutter am Elm, Schwerin, Hamburg, Sylt, Schwanewede, Osnabrück, Menden (Sauerland), Bochum, Moers, Sankt Augustin, Trier, Offenbach am Main, Griesheim, Ubstadt-Weiher
default  n=40 seed 1: 149 s, L2 340, archive 30 | 8.47→8.47 mm (exact, 7 s, D 1.00, R 0.42); 8.47→8.47 mm (exact, 4 s, D 1.00, R 0.40); 24.64→24.64 mm (exact, 41 s, D 1.00, R 0.36)
         best: Rheinfelden (Baden), Friedrichshafen, Memmingen, Peißenberg, München, Freising, Regensburg, Schwabach, Coburg, Ilmenau, Hettstedt, Schkeuditz, Dresden, Berlin, Premnitz, Wolmirstedt, Dannenberg (Elbe), Hamburg, Stade, Großefehn, Bremen, Walsrode, Hannover, Vechelde, Goslar, Göttingen, Bad Wünnenberg, Rheine, Dortmund, Lüdenscheid, Wuppertal, Duisburg, Köln, Plaidt, Dillenburg, Neu-Isenburg, Ludwigshafen am Rhein, Calw, Stuttgart, Tübingen
default  n=40 seed 2: 137 s, L2 331, archive 30 | 13.09→13.09 mm (exact, 12 s, D 1.00, R 0.35); 9.76→9.76 mm (exact, 4 s, D 1.00, R 0.28); 9.98→9.98 mm (exact, 12 s, D 1.00, R 0.28)
         best: Leipzig, Annaburg, Potsdam, Kyritz, Heringsdorf, Wismar, Hamburg, Uetze, Ganderkesee, Westerstede, Osnabrück, Bielefeld, Selm, Essen, Kleve, Meerbusch, Leverkusen, Biedenkopf, Korbach, Kassel, Georgenthal, Bamberg, Wertheim, Bad König, Frankfurt am Main, Worms, Bad Kreuznach, Zweibrücken, Iffezheim, Neuried, Müllheim, Villingen-Schwenningen, Reichenau, Kempten (Allgäu), Augsburg, München, Mühldorf, Sulzbach-Rosenberg, Bindlach, Chemnitz
default  n=40 seed 3: 111 s, L2 312, archive 27 | 8.35→8.35 mm (exact, 23 s, D 1.00, R 0.43); 8.73→8.73 mm (exact, 6 s, D 1.00, R 0.40); 6.22→6.22 mm (exact, 4 s, D 1.00, R 0.40)
         best: Waren (Müritz), Brandenburg an der Havel, Magdeburg, Halle (Saale), Weißenfels, Leipzig, Spremberg, Dresden, Klingenthal, Nürnberg, München, Augsburg, Schwäbisch Gmünd, Waiblingen, Bad Rappenau, Pfinztal, Konstanz, Staufen im Breisgau, Saarbrücken, Kaiserslautern, Kirchheimbolanden, Ludwigshafen am Rhein, Frankfurt am Main, Lauterbach (Hessen), Gießen, Weilburg, Köln, Eschweiler, Düsseldorf, Dortmund, Lüdenscheid, Olsberg, Lippstadt, Lage, Petershagen, Stuhr, Hamburg, Lübeck, Rostock, Sassnitz
default  n=50 seed 1: 188 s, L2 299, archive 24 | 13.73→13.73 mm (exact, 27 s, D 1.00, R 0.30); 23.66→23.66 mm (exact, 62 s, D 0.70, R 0.59); 13.73→13.73 mm (exact, 27 s, D 1.00, R 0.29)
         best: Itzehoe, Husum, Stralsund, Strausberg, Senftenberg, Großenhain, Bad Belzig, Bernburg (Saale), Duderstadt, Nottertal-Heilinger Höhen, Erfurt, Suhl, Bamberg, Roßtal, Altdorf bei Nürnberg, Schwarzenfeld, Deggendorf, Regensburg, Gaimersheim, München, Murnau am Staffelsee, Kempten (Allgäu), Laupheim, Esslingen am Neckar, Sachsenheim, Emmendingen, Homburg, Trier, Bad Sobernheim, Enkenbach-Alsenborn, Schwetzingen, Darmstadt, Maintal, Schöffengrund, Kreuztal, Much, Köln, Düsseldorf, Hagen, Recklinghausen, Uedem, Heek, Rheine, Bersenbrück, Telgte, Rheda-Wiedenbrück, Herford, Wrestedt, Hamburg, Fredenbeck
default  n=50 seed 2: 142 s, L2 357, archive 27 | 7.89→7.89 mm (exact, 41 s, D 0.93, R 0.46); 14.91→14.87 mm (exact, 18 s, D 1.00, R 0.35); 7.78→7.78 mm (exact, 9 s, D 1.00, R 0.35)
         best: Berlin, Wustermark, Malchow, Rostock, Schwerin, Lübeck, Neumünster, Hamburg, Großheide, Oldenburg, Bremen, Hameln, Hannover, Braunschweig, Göttingen, Kassel, Paderborn, Bielefeld, Hamm, Münster, Goch, Aachen, Köln, Altenkirchen (Westerwald), Eschenburg, Staufenberg, Usingen, Wiesbaden, Koblenz, Trier, Friedrichsthal, Freiburg im Breisgau, Weil am Rhein, Konstanz, Reutlingen, Stuttgart, Süßen, Laupheim, München, Ingolstadt, Würzburg, Eichenzell, Bad Salzungen, Erfurt, Jena, Chemnitz, Leipzig, Halle (Saale), Magdeburg, Jessen (Elster)
default  n=50 seed 3: 139 s, L2 336, archive 26 | 9.46→9.46 mm (exact, 21 s, D 0.82, R 0.52); 6.40→6.40 mm (exact, 5 s, D 1.00, R 0.31); 19.03→17.41 mm (exact, 69 s, D 0.67, R 0.61)
         best: Köln, Königswinter, Siegen, Frankfurt am Main, Wiesbaden, Koblenz, Trier, Saarbrücken, Kaiserslautern, Mannheim, Heilbronn, Karlsruhe, Ihringen, Geislingen, Kirchheim unter Teck, Ulm, Bad Wörishofen, Augsburg, München, Pfarrkirchen, Regensburg, Ingolstadt, Nürnberg, Würzburg, Erfurt, Halle (Saale), Leipzig, Chemnitz, Dresden, Belgern-Schildau, Doberlug-Kirchhain, Berlin, Rostock, Schwerin, Lübeck, Kiel, Hamburg, Bremerhaven, Oldenburg, Hannover, Göttingen, Kassel, Paderborn, Bielefeld, Münster, Hamm, Dortmund, Haltern am See, Xanten, Krefeld
```

| mode | n | runs | max verified gap (mm) | median of run maxima (mm) | bound overestimates |
|---|---|---|---|---|---|
| max-gap | 30 | 3 | 43.79 | 43.24 | 2/9 |
| max-gap | 40 | 3 | 44.13 | 41.23 | 0/9 |
| max-gap | 50 | 3 | 41.46 | 41.37 | 0/9 |
| default | 30 | 3 | 20.83 | 18.18 | 0/9 |
| default | 40 | 3 | 24.64 | 13.09 | 0/9 |
| default | 50 | 3 | 23.66 | 17.41 | 2/9 |
