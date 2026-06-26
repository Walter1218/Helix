CREATE TABLE `input_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`input` text NOT NULL,
	`mode` text,
	`parts` text NOT NULL,
	`time_created` integer NOT NULL
);
