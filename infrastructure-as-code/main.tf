

variable "file_keys" {
  default = ["0", "1", "3", "4"]
}

resource "local_file" "foo" {
  for_each = toset(var.file_keys)
  content  = "# Some content for file ${each.key}"
  filename = "file${each.key}.txt"
}