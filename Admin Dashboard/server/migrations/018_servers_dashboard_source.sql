-- W-0064, Punkt 4: Einladungen über das Bot-Dashboard tragen den Einlader aus dem Freigabe-Pass.
ALTER TABLE server_invites MODIFY source ENUM('audit', 'owner', 'dashboard') NOT NULL;
