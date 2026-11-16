-- W-0125: Epic-Konten nur noch über den Epic-Login.
--
-- Bis hierher reichte für /rank link ein Name: verified = 1 hieß nur, dass Prime
-- ihn kannte. Damit konnte sich jeder das Konto eines anderen holen, samt seinen
-- Rang-Rollen. Keine dieser Verknüpfungen ist also belegt. Sie gehen alle weg,
-- und jeder verbindet sich einmal neu über Epic.
--
-- Die Rang-Stände hängen nur an der Verknüpfung (gelesen werden sie allein für
-- verknüpfte Mitglieder, siehe ActivityService). Ohne sie bleiben sie liegen,
-- also gehen sie mit.
DELETE FROM player_accounts;
DELETE FROM player_ranks;
DELETE FROM player_profiles;

-- Ein Epic-Konto gehört genau einem Discord-Konto. Bisher durfte dasselbe Konto
-- an beliebig vielen Discord-Konten hängen; jetzt verhindert das die Datenbank.
ALTER TABLE player_accounts
    DROP INDEX idx_account_lookup,
    ADD UNIQUE KEY uq_account (platform, account_id);
